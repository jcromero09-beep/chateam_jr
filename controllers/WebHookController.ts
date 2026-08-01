import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import { handleMessage } from "../services/FacebookServices/facebookMessageListener";
// Módulo Comentarios FB/IG — este endpoint (/webhook) es el callback del
// objeto 'page'/'instagram' en Meta, por donde Meta entrega los comentarios
// (entry[].changes[]). Reenviamos esos eventos al inbox de comentarios.
import IngestCommentService from "../services/SocialCommentServices/IngestCommentService";
import { extractCommentEvents } from "../services/SocialCommentServices/extractCommentEvents";
import logger from "../utils/logger";
// Validación HMAC X-Hub-Signature-256. Este callback ingiere mensajería y
// comentarios de páginas FB/IG: sin firma, cualquiera puede POSTear eventos
// falsos e inyectarlos en el inbox de un tenant (basta con acertar el
// facebookPageUserId, que no es secreto).
import {
  shouldAcceptWebhook as verifyMetaSignature,
  getSignatureMode
} from "../services/CoexistenceServices/MetaSignatureValidator";
import { getTraceId } from "../utils/traceContext";
import { getMetaVerifyToken } from "../helpers/metaVerifyToken";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const VERIFY_TOKEN = getMetaVerifyToken();

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!VERIFY_TOKEN) {
    logger.error(
      "[Webhook FB] VERIFY_TOKEN no configurado — se rechaza el handshake de suscripción"
    );
    return res.status(403).json({ message: "Forbidden" });
  }

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
  }

  return res.status(403).json({
    message: "Forbidden"
  });
};

export const webHook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  // Firma HMAC ANTES de cualquier procesamiento. Mismo modo/env que el resto
  // de webhooks Meta (META_SIGNATURE_MODE).
  const sigHeader =
    req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];
  const sigCheck = verifyMetaSignature(
    (req as any).rawBody,
    sigHeader,
    getTraceId()
  );
  if (!sigCheck.accept) {
    logger.error(
      `[Webhook FB] Firma HMAC inválida (mode=${getSignatureMode()}, reason=${sigCheck.result.reason}) — rechazando`
    );
    return res
      .status(403)
      .json({ error: "invalid_signature", reason: sigCheck.result.reason });
  }

  try {
    const { body } = req;

    // Antes se volcaba el body completo con JSON.stringify(body, null, 2): eso
    // imprime mensajes y teléfonos de clientes en claro en el log. Se deja solo
    // la traza mínima para diagnóstico.
    logger.debug(
      `[Webhook FB] evento recibido object=${body?.object} entries=${body?.entry?.length ?? 0} sig=${sigCheck.result.reason}`
    );

    if (body.object === "page" || body.object === "instagram") {
      let channel: string;

      if (body.object === "page") {
        channel = "facebook";
      } else {
        channel = "instagram";
      }

      // ── Comentarios FB/IG: entry[].changes[] (feed/comments) ──────────
      // Meta entrega los comentarios de página por ESTE mismo callback
      // (object=page/instagram) mezclados con la mensajería. Los extraemos
      // y los ingerimos en el inbox (SocialComments) SIN bloquear la
      // respuesta y SIN afectar el flujo de Messenger de abajo.
      try {
        const commentEvents = extractCommentEvents(body);
        if (commentEvents.length > 0) {
          logger.info(
            `[Webhook FB] 💬 ${commentEvents.length} evento(s) de comentario detectado(s) (object=${body.object})`
          );
          for (const commentEvent of commentEvents) {
            IngestCommentService(commentEvent).catch(commentErr => {
              const msg =
                commentErr instanceof Error
                  ? commentErr.message
                  : String(commentErr);
              logger.error(
                `[Webhook FB] Error ingiriendo comentario ${commentEvent.commentId}: ${msg}`
              );
            });
          }
        }
      } catch (commentExtractErr) {
        const msg =
          commentExtractErr instanceof Error
            ? commentExtractErr.message
            : String(commentExtractErr);
        logger.error(`[Webhook FB] Error extrayendo comentarios: ${msg}`);
      }

      for (const entry of body.entry ?? []) {
        const getTokenPage = await Whatsapp.findOne({
          where: {
            facebookPageUserId: entry.id,
            channel
          }
        });

        if (getTokenPage) {
          entry.messaging?.forEach((data: any) => {
            handleMessage(getTokenPage, data, channel, getTokenPage.companyId);
          });
        }
      }

      return res.status(200).json({
        message: "EVENT_RECEIVED"
      });
    }

    return res.status(404).json({
      message: body
    });
  } catch (error) {
    console.log('error',error, )
    return res.status(500).json({
   
      message: error
    });
  }
};