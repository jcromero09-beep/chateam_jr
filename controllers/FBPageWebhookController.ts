/**
 * FBPageWebhookController — Webhook para comentarios de Facebook Pages
 * Recibe notificaciones de feed (comentarios) y los envía al procesador.
 *
 * GET  /webhook/facebook → verify (verificación de suscripción)
 * POST /webhook/facebook → receive (eventos de comentarios)
 */

import { Request, Response } from "express";
import { logInfo, logError } from "../utils/logger";
// [Fase2·N6.1] Validación HMAC X-Hub-Signature-256 (mismo validador que el webhook WhatsApp)
import {
  shouldAcceptWebhook as verifyMetaSignature,
  getSignatureMode
} from "../services/CoexistenceServices/MetaSignatureValidator";
import { getTraceId } from "../utils/traceContext";

/**
 * GET /webhook/facebook
 * Verificación de suscripción del webhook de Facebook.
 * Facebook envía hub.mode, hub.verify_token y hub.challenge.
 */
export const verify = async (req: Request, res: Response): Promise<Response | void> => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;

  const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || "chateam_fb_verify";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logInfo("[FBPageWebhook] Verificación exitosa del webhook Facebook Pages");
    return res.status(200).send(challenge);
  }

  logError("[FBPageWebhook] Verificación fallida — token inválido", {
    mode,
    tokenReceived: token ? `${token.substring(0, 6)}...` : "none"
  });
  return res.sendStatus(403);
};

/**
 * POST /webhook/facebook
 * Recibe eventos de feed de Facebook Pages (comentarios).
 * Responde inmediatamente con 200 y procesa en background.
 */
export const receive = async (req: Request, res: Response): Promise<void> => {
  // [Fase2·N6.1] Validar la firma HMAC ANTES de procesar. Modo por defecto 'warn'
  // (loguea, acepta); pasar a 'enforce' vía env META_SIGNATURE_MODE cuando se
  // confirme que todas las firmas entrantes son válidas.
  const traceId = getTraceId();
  const sigHeader =
    req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
  const sigCheck = verifyMetaSignature((req as any).rawBody, sigHeader, traceId);
  if (!sigCheck.accept) {
    logError(
      `[FBPageWebhook] ❌ Firma HMAC inválida (mode=${getSignatureMode()}, reason=${sigCheck.result.reason}) — rechazando`
    );
    res.status(403).json({ error: "invalid_signature", reason: sigCheck.result.reason });
    return;
  }

  // Responder inmediatamente — Meta requiere respuesta rápida
  res.sendStatus(200);

  try {
    const { body } = req;

    if (body.object !== "page" || !body.entry || !body.entry.length) {
      return;
    }

    const entry = body.entry[0];
    if (!entry.changes || !entry.changes.length) {
      return;
    }

    const change = entry.changes[0];
    const { field, value } = change;

    // Solo procesar comentarios nuevos en el feed
    if (field !== "feed" || value?.item !== "comment" || value?.verb !== "add") {
      return;
    }

    const pageId: string = entry.id;
    let postId: string = value.post_id;
    const commentId: string = value.comment_id;
    const message: string = value.message || "";
    const from: { name: string; id: string } = value.from || { name: "", id: "" };
    const parentId: string | undefined = value.parent_id;

    // Manejar posts multi-imagen: si postId !== parentId, reconstruir postId real
    if (parentId && postId !== parentId) {
      const parentParts = parentId.split("_");
      if (parentParts.length >= 2) {
        postId = `${pageId}_${parentParts[1]}`;
      }
    }

    // No procesar comentarios vacíos
    if (!message.trim()) {
      logInfo("[FBPageWebhook] Comentario vacío ignorado", { commentId });
      return;
    }

    // Importar dinámicamente para evitar circular dependencies en startup
    const { processIncomingComment } = await import(
      "../services/CommentAutoReplyServices/WebhookCommentProcessor"
    );

    await processIncomingComment({
      pageId,
      postId,
      commentId,
      commentText: message,
      commenterName: from.name,
      commenterId: from.id,
      commentedAt: new Date((value.created_time || Math.floor(Date.now() / 1000)) * 1000),
      platform: "facebook"
    });
  } catch (error) {
    // NUNCA lanzar error — el webhook ya respondió 200
    logError("[FBPageWebhook] Error procesando evento de comentario", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
