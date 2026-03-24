// controllers/MetaWebhookController.ts
import { Request, Response } from "express";
import { handleMetaWebhookMessage } from "../services/MetaServices/metaMessageListener";
import Whatsapp from "../models/Whatsapp";
import HandleTemplateStatusWebhookService, {
  isTemplateStatusWebhook
} from "../services/WhatsAppTemplateServices/HandleTemplateStatusWebhookService";

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
  // Responde rápido a Meta
  res.sendStatus(200);

  // ── LOG DE ENTRADA COMPLETO ──────────────────────────────────────
  const ts = new Date().toISOString();
  const userAgent = req.headers["user-agent"] || "sin-ua";
  const ip = req.ip || req.socket?.remoteAddress || "sin-ip";
  const bodyStr = JSON.stringify(req.body);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📨 [META WEBHOOK] ${ts}`);
  console.log(`   IP: ${ip}  |  UA: ${userAgent}`);
  console.log(`   Body (${bodyStr.length} bytes): ${bodyStr.substring(0, 500)}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  // ─────────────────────────────────────────────────────────────────

  try {
    // Verificar si es un evento de actualización de estado de template
    if (isTemplateStatusWebhook(req.body)) {
      console.log("[Webhook Meta] Procesando evento de template status");
      await HandleTemplateStatusWebhookService(req.body);
      return;
    }

    // Procesar mensajes normales de WhatsApp
    await handleMetaWebhookMessage(req.body);
  } catch (e) {
    console.error("❌ Error al manejar evento Meta:", e);
  }
};
