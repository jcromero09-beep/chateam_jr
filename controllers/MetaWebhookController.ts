// controllers/MetaWebhookController.ts
import { Request, Response } from "express";
import { handleMetaWebhookMessage } from "../services/MetaServices/metaMessageListener";
import Whatsapp from "../models/Whatsapp";
import HandleTemplateStatusWebhookService, {
  isTemplateStatusWebhook
} from "../services/WhatsAppTemplateServices/HandleTemplateStatusWebhookService";
// FASE 2 Coexistencia — validación HMAC X-Hub-Signature-256
import {
  shouldAcceptWebhook as verifyMetaSignature,
  getSignatureMode
} from "../services/CoexistenceServices/MetaSignatureValidator";
import { getTraceId } from "../utils/traceContext";

/** GET /webhooks/meta - Verificación dinâmica */
export const verifyMetaWebhook = async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe") {
    // 1. Verificar contra el VERIFY_TOKEN global (suscripción App-level)
    const globalVerifyToken = process.env.VERIFY_TOKEN || "whaticket";
    if (token === globalVerifyToken) {
      console.log("✅ Webhook Meta verificado con VERIFY_TOKEN global (App-level subscription)");
      return res.status(200).send(challenge as string);
    }

    // 2. Buscar cualquier conexión Meta con este verify token (per-WABA subscription)
    const whatsapp = await Whatsapp.findOne({
      where: {
        tokenMeta: token as string,
        provider: "meta",
        channel: "meta"
      }
    });

    if (whatsapp) {
      console.log("✅ Webhook Meta verificado para conexion:", whatsapp.name);
      return res.status(200).send(challenge as string);
    }
  }

  console.log("❌ Token de verificación Meta inválido:", token);
  return res.sendStatus(403);
};

/** POST /webhooks/meta - Eventos */
export const receiveMetaWebhook = async (req: Request, res: Response) => {
  // ═══ FASE 2 Coexistencia — Validación HMAC X-Hub-Signature-256 ═══
  // Modo por defecto: 'warn' (loguea pero acepta). Migrar a 'enforce'
  // vía env META_SIGNATURE_MODE=enforce cuando se confirme que todas
  // las firmas entrantes son válidas.
  const traceId = getTraceId();
  const sigHeader =
    req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
  const sigCheck = verifyMetaSignature((req as any).rawBody, sigHeader, traceId);
  if (!sigCheck.accept) {
    // Modo enforce + firma inválida → 403
    console.warn(
      `[META WEBHOOK] ❌ Firma HMAC inválida (mode=${getSignatureMode()}, reason=${sigCheck.result.reason}) — rechazando`
    );
    return res.status(403).json({
      error: "invalid_signature",
      reason: sigCheck.result.reason
    });
  }
  // ══════════════════════════════════════════════════════════════════

  // Responde rápido a Meta
  res.sendStatus(200);

  // ── LOG DE ENTRADA COMPLETO ──────────────────────────────────────
  const ts = new Date().toISOString();
  const userAgent = req.headers["user-agent"] || "sin-ua";
  const ip = req.ip || req.socket?.remoteAddress || "sin-ip";
  const bodyStr = JSON.stringify(req.body);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📨 [META WEBHOOK] ${ts}`);
  console.log(`   IP: ${ip}  |  UA: ${userAgent}  |  Sig: ${sigCheck.result.reason}`);
  console.log(`   Body (${bodyStr.length} bytes): ${bodyStr.substring(0, 500)}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  // ─────────────────────────────────────────────────────────────────

  // 🔍 DIAGNÓSTICO: Time limit de seguridad para evitar cuelgues
  const TIMEOUT_MS = 25000;
  let completed = false;

  const timeoutId = setTimeout(() => {
    if (!completed) {
      console.error(`⏰ [META WEBHOOK] ⏰ TIMEOUT después de ${TIMEOUT_MS}ms - el handler no completó`);
      console.error(`[META WEBHOOK] Última acción conocida: ver arriba`);
    }
  }, TIMEOUT_MS);

  try {
    // Verificar si es un evento de actualización de estado de template
    if (isTemplateStatusWebhook(req.body)) {
      console.log("[Webhook Meta] Procesando evento de template status");
      await HandleTemplateStatusWebhookService(req.body);
      completed = true;
      clearTimeout(timeoutId);
      console.log("[Webhook Meta] ✅ Template status procesado");
      return;
    }

    // Procesar mensajes normales de WhatsApp
    console.log("[Webhook Meta] 🔄 Llamando handleMetaWebhookMessage...");
    await handleMetaWebhookMessage(req.body);
    completed = true;
    clearTimeout(timeoutId);
    console.log("[Webhook Meta] ✅ handleMetaWebhookMessage completó");
  } catch (e: any) {
    completed = true;
    clearTimeout(timeoutId);
    console.error("❌ Error al manejar evento Meta:", e?.message || e);
    console.error("❌ Stack:", e?.stack);
  }
};
