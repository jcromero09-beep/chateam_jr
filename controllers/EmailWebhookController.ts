/**
 * EmailWebhookController — Email Marketing Fase 2
 * Endpoints PUBLICOS (sin auth) para recibir webhooks de proveedores de email:
 * - POST /webhooks/email/sendgrid — SendGrid Event Webhook
 * - POST /webhooks/email/mailgun — Mailgun Webhooks
 * - POST /webhooks/email/carbonio — Carbonio bounce notifications
 *
 * Los eventos se procesan de forma sincrona por simplicidad.
 * En produccion a escala, se podrian encolar en Bull/Redis.
 */

import { Request, Response } from "express";
import { Op } from "sequelize";
import EmailCampaignRecipient from "../models/EmailMarketing/EmailCampaignRecipient";
import * as TrackingService from "../services/EmailMarketing/TrackingService";
import logger from "../utils/logger";

/**
 * Buscar recipient por providerMessageId (campo que se setea al enviar)
 */
const findRecipientByMessageId = async (
  messageId: string
): Promise<EmailCampaignRecipient | null> => {
  if (!messageId) return null;

  return EmailCampaignRecipient.findOne({
    where: {
      providerMessageId: {
        [Op.or]: [messageId, `<${messageId}>`, messageId.replace(/[<>]/g, "")]
      }
    }
  });
};

/**
 * Buscar recipient por email + campaignId (fallback)
 */
const findRecipientByEmail = async (
  email: string,
  campaignId?: number
): Promise<EmailCampaignRecipient | null> => {
  if (!email) return null;

  const where: Record<string, unknown> = { email };
  if (campaignId) {
    where.campaignId = campaignId;
  }

  return EmailCampaignRecipient.findOne({
    where,
    order: [["createdAt", "DESC"]]
  });
};

// ============================================================
// SendGrid Event Webhook
// Documentacion: https://docs.sendgrid.com/for-developers/tracking-events/event
// ============================================================

interface SendGridEvent {
  event: string;
  email: string;
  timestamp: number;
  sg_message_id?: string;
  sg_event_id?: string;
  reason?: string;
  type?: string;
  url?: string;
  useragent?: string;
  ip?: string;
  status?: string;
  bounce_classification?: string;
  category?: string[];
}

/**
 * POST /webhooks/email/sendgrid
 * Recibe array de eventos de SendGrid y los procesa
 */
export const sendgridWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    logger.info(
      `[EmailWebhookController] SendGrid webhook recibido — ${events.length} eventos`
    );

    let processed = 0;
    let skipped = 0;

    for (const event of events) {
      try {
        // Buscar recipient por sg_message_id o email
        const messageId = event.sg_message_id?.split(".")[0] || "";
        let recipient = await findRecipientByMessageId(messageId);

        if (!recipient && event.email) {
          recipient = await findRecipientByEmail(event.email);
        }

        if (!recipient) {
          skipped++;
          continue;
        }

        // Mapear evento SendGrid a nuestro tracking
        switch (event.event) {
          case "delivered":
            await TrackingService.trackDelivery(recipient.id);
            break;

          case "open":
            await TrackingService.trackOpen(recipient.id, {
              ip: event.ip,
              userAgent: event.useragent
            });
            break;

          case "click":
            if (event.url) {
              await TrackingService.trackClick(recipient.id, event.url, {
                ip: event.ip,
                userAgent: event.useragent
              });
            }
            break;

          case "bounce":
          case "dropped":
            await TrackingService.trackBounce(
              recipient.id,
              event.type || event.bounce_classification || "hard",
              event.reason || event.status || "Bounce from SendGrid"
            );
            break;

          case "deferred":
            // Deferred no es un bounce definitivo, solo loguear
            logger.info(
              `[EmailWebhookController] SendGrid deferred — recipient: ${recipient.id}, reason: ${event.reason}`
            );
            break;

          case "unsubscribe":
          case "group_unsubscribe":
            await TrackingService.trackUnsubscribe(recipient.id);
            break;

          case "spamreport":
            await TrackingService.trackSpamComplaint(recipient.id);
            break;

          default:
            logger.info(
              `[EmailWebhookController] SendGrid evento no mapeado: ${event.event}`
            );
        }

        processed++;
      } catch (eventError: unknown) {
        const err = eventError as Error;
        logger.error(
          `[EmailWebhookController] Error procesando evento SendGrid: ${err.message}`
        );
        skipped++;
      }
    }

    logger.info(
      `[EmailWebhookController] SendGrid webhook procesado — ${processed} ok, ${skipped} omitidos`
    );

    return res.status(200).json({
      success: true,
      message: "Webhook procesado",
      data: { processed, skipped }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailWebhookController] Error en sendgridWebhook: ${err.message}`);
    // Siempre retornar 200 a SendGrid para evitar reintentos
    return res.status(200).json({
      success: false,
      message: "Error procesando webhook",
      errors: [err.message]
    });
  }
};

// ============================================================
// Mailgun Webhook
// Documentacion: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Webhooks/
// ============================================================

interface MailgunEventData {
  event: string;
  recipient?: string;
  message?: {
    headers?: {
      "message-id"?: string;
    };
  };
  "user-variables"?: Record<string, string>;
  reason?: string;
  severity?: string;
  url?: string;
  ip?: string;
  "client-info"?: {
    "user-agent"?: string;
    "device-type"?: string;
    "client-name"?: string;
  };
  delivery_status?: {
    code?: number;
    message?: string;
    description?: string;
  };
}

interface MailgunWebhookBody {
  signature?: {
    timestamp?: string;
    token?: string;
    signature?: string;
  };
  "event-data"?: MailgunEventData;
}

/**
 * POST /webhooks/email/mailgun
 * Recibe evento individual de Mailgun
 */
export const mailgunWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const body = req.body as MailgunWebhookBody;
    const eventData = body["event-data"];

    if (!eventData) {
      logger.warn("[EmailWebhookController] Mailgun webhook sin event-data");
      return res.status(200).json({ success: true, message: "No event data" });
    }

    logger.info(
      `[EmailWebhookController] Mailgun webhook recibido — evento: ${eventData.event}`
    );

    // Buscar recipient
    const messageId = eventData.message?.headers?.["message-id"] || "";
    let recipient = await findRecipientByMessageId(messageId);

    if (!recipient && eventData.recipient) {
      recipient = await findRecipientByEmail(eventData.recipient);
    }

    if (!recipient) {
      logger.warn(
        `[EmailWebhookController] Mailgun — recipient no encontrado para messageId: ${messageId}`
      );
      return res.status(200).json({ success: true, message: "Recipient no encontrado" });
    }

    const clientInfo = eventData["client-info"];

    switch (eventData.event) {
      case "delivered":
        await TrackingService.trackDelivery(recipient.id);
        break;

      case "opened":
        await TrackingService.trackOpen(recipient.id, {
          ip: eventData.ip,
          userAgent: clientInfo?.["user-agent"],
          deviceType: clientInfo?.["device-type"],
          emailClient: clientInfo?.["client-name"]
        });
        break;

      case "clicked":
        if (eventData.url) {
          await TrackingService.trackClick(recipient.id, eventData.url, {
            ip: eventData.ip,
            userAgent: clientInfo?.["user-agent"],
            deviceType: clientInfo?.["device-type"],
            emailClient: clientInfo?.["client-name"]
          });
        }
        break;

      case "failed":
        if (eventData.severity === "permanent") {
          await TrackingService.trackBounce(
            recipient.id,
            "hard",
            eventData.delivery_status?.description || eventData.reason || "Permanent failure"
          );
        } else {
          // Soft bounce / temporary failure
          await TrackingService.trackBounce(
            recipient.id,
            "soft",
            eventData.delivery_status?.description || eventData.reason || "Temporary failure"
          );
        }
        break;

      case "unsubscribed":
        await TrackingService.trackUnsubscribe(recipient.id);
        break;

      case "complained":
        await TrackingService.trackSpamComplaint(recipient.id);
        break;

      default:
        logger.info(
          `[EmailWebhookController] Mailgun evento no mapeado: ${eventData.event}`
        );
    }

    return res.status(200).json({
      success: true,
      message: "Webhook procesado"
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailWebhookController] Error en mailgunWebhook: ${err.message}`);
    return res.status(200).json({
      success: false,
      message: "Error procesando webhook",
      errors: [err.message]
    });
  }
};

// ============================================================
// Carbonio Webhook (bounce notifications via SMTP)
// ============================================================

interface CarbonioEvent {
  type?: string;
  recipient?: string;
  messageId?: string;
  bounceType?: string;
  reason?: string;
  diagnosticCode?: string;
}

/**
 * POST /webhooks/email/carbonio
 * Recibe notificaciones de bounce de Carbonio
 */
export const carbonioWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const event = req.body as CarbonioEvent;

    logger.info(
      `[EmailWebhookController] Carbonio webhook recibido — tipo: ${event.type || "unknown"}`
    );

    if (!event.messageId && !event.recipient) {
      return res.status(200).json({
        success: true,
        message: "Sin datos identificables"
      });
    }

    // Buscar recipient
    let recipient: EmailCampaignRecipient | null = null;

    if (event.messageId) {
      recipient = await findRecipientByMessageId(event.messageId);
    }

    if (!recipient && event.recipient) {
      recipient = await findRecipientByEmail(event.recipient);
    }

    if (!recipient) {
      logger.warn(
        `[EmailWebhookController] Carbonio — recipient no encontrado`
      );
      return res.status(200).json({
        success: true,
        message: "Recipient no encontrado"
      });
    }

    switch (event.type) {
      case "bounce":
      case "hard_bounce":
        await TrackingService.trackBounce(
          recipient.id,
          event.bounceType || "hard",
          event.reason || event.diagnosticCode || "Bounce from Carbonio"
        );
        break;

      case "soft_bounce":
        await TrackingService.trackBounce(
          recipient.id,
          "soft",
          event.reason || event.diagnosticCode || "Soft bounce from Carbonio"
        );
        break;

      case "delivered":
        await TrackingService.trackDelivery(recipient.id);
        break;

      default:
        logger.info(
          `[EmailWebhookController] Carbonio evento no mapeado: ${event.type}`
        );
    }

    return res.status(200).json({
      success: true,
      message: "Webhook procesado"
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailWebhookController] Error en carbonioWebhook: ${err.message}`);
    return res.status(200).json({
      success: false,
      message: "Error procesando webhook",
      errors: [err.message]
    });
  }
};
