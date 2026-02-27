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
    // Buscar cualquier conexión Meta con este verify token
    const whatsapp = await Whatsapp.findOne({
      where: {
        tokenMeta: token as string,
        provider: "meta",
        channel: "meta"
      }
    });

    if (whatsapp) {
      console.log("✅ Webhook Meta verificado para:", whatsapp.name);
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
