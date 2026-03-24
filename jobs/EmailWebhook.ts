/**
 * Job: EmailWebhook
 * Procesa webhooks y notificaciones de bounce/open/click de proveedores de email.
 *
 * Flujo:
 * 1. Busca el EmailCampaignRecipient por id
 * 2. Actualiza el recipient segun el tipo de evento:
 *    - bounced: bouncedAt, bounceType, bounceReason
 *    - opened: openedAt, openCount++
 *    - clicked: clickedAt, clickCount++
 *    - unsubscribed: unsubscribedAt
 * 3. Crea un registro EmailTrackingEvent
 * 4. Registra el evento via logs
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface EmailWebhookJobData {
  provider: string;
  eventType: string;
  recipientId: number;
  campaignId: number;
  companyId: number;
  eventData: Record<string, unknown>;
}

const handle = async (job: Job<EmailWebhookJobData>): Promise<{ recipientId: number; eventType: string }> => {
  const { provider, eventType, recipientId, campaignId, companyId, eventData } = job.data;

  logger.info(
    `[EmailWebhook] Procesando evento: type=${eventType}, ` +
    `recipientId=${recipientId}, campaignId=${campaignId}, ` +
    `provider=${provider}, company=${companyId}`
  );

  // Lazy load de modelos
  const EmailCampaignRecipient = require("../models/EmailMarketing/EmailCampaignRecipient").default;
  const EmailTrackingEvent = require("../models/EmailMarketing/EmailTrackingEvent").default;

  // 1. Buscar el recipient
  const recipient = await EmailCampaignRecipient.findOne({
    where: { id: recipientId, companyId }
  });

  if (!recipient) {
    logger.error(
      `[EmailWebhook] Recipient no encontrado: id=${recipientId}, company=${companyId}`
    );
    throw new Error(`Recipient ${recipientId} no encontrado`);
  }

  try {
    // 2. Actualizar recipient segun tipo de evento
    const now = new Date();
    const updateData: Record<string, unknown> = {};

    switch (eventType) {
      case "bounced":
        updateData.status = "bounced";
        updateData.bouncedAt = now;
        updateData.bounceType = (eventData.bounceType as string) || "unknown";
        updateData.bounceReason = (eventData.bounceReason as string) || "No reason provided";
        break;

      case "opened":
        updateData.openCount = (recipient.openCount || 0) + 1;
        if (!recipient.openedAt) {
          updateData.openedAt = now;
          updateData.firstOpenedAt = now;
        } else {
          updateData.openedAt = now;
        }
        break;

      case "clicked":
        updateData.clickCount = (recipient.clickCount || 0) + 1;
        if (!recipient.clickedAt) {
          updateData.clickedAt = now;
          updateData.firstClickedAt = now;
        } else {
          updateData.clickedAt = now;
        }
        break;

      case "unsubscribed":
        updateData.unsubscribedAt = now;
        updateData.status = "unsubscribed";
        break;

      case "delivered":
        updateData.status = "delivered";
        updateData.deliveredAt = now;
        break;

      case "spam_complaint":
        updateData.spamComplaintAt = now;
        updateData.status = "spam_complaint";
        break;

      default:
        logger.warn(
          `[EmailWebhook] Tipo de evento no reconocido: ${eventType}`
        );
    }

    if (Object.keys(updateData).length > 0) {
      await recipient.update(updateData);
      logger.info(
        `[EmailWebhook] Recipient ${recipientId} actualizado: ` +
        `eventType=${eventType}, fields=${Object.keys(updateData).join(",")}`
      );
    }

    // 3. Crear registro de tracking event
    await EmailTrackingEvent.create({
      recipientId,
      campaignId,
      companyId,
      eventType,
      eventData: eventData || {},
      ipAddress: (eventData.ipAddress as string) || null,
      userAgent: (eventData.userAgent as string) || null,
      linkUrl: (eventData.linkUrl as string) || null,
      deviceType: (eventData.deviceType as string) || null,
      emailClient: (eventData.emailClient as string) || null,
      timestamp: now
    });

    logger.info(
      `[EmailWebhook] TrackingEvent creado: recipientId=${recipientId}, ` +
      `eventType=${eventType}, provider=${provider}`
    );

    return { recipientId, eventType };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[EmailWebhook] Error procesando evento: recipientId=${recipientId}, ` +
      `eventType=${eventType}, error=${errorMessage}`
    );

    // Re-throw para que Bull registre el fallo y aplique retry
    throw error;
  }
};

export default handle;
