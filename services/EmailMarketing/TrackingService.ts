/**
 * TrackingService — Email Marketing Fase 2
 * Registra eventos de tracking: opens, clicks, bounces, unsubscribes, deliveries.
 * BD SAGRADA: nunca elimina datos, solo actualiza e inserta.
 */

import EmailCampaign from "../../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import EmailTrackingEvent from "../../models/EmailMarketing/EmailTrackingEvent";
import logger from "../../utils/logger";

interface TrackingMetadata {
  ip?: string;
  userAgent?: string;
  deviceType?: string;
  emailClient?: string;
}

/**
 * Registrar apertura de email (tracking pixel)
 */
export const trackOpen = async (
  recipientId: number,
  metadata: TrackingMetadata
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackOpen`);
      return;
    }

    // Incrementar openCount
    await recipient.increment("openCount", { by: 1 });

    // Si es la primera apertura, setear firstOpenedAt
    const updateData: Record<string, unknown> = {
      openedAt: new Date()
    };

    if (!recipient.firstOpenedAt) {
      updateData.firstOpenedAt = new Date();
    }

    // Actualizar status solo si era 'sent' o 'delivered'
    if (recipient.status === "sent" || recipient.status === "delivered") {
      updateData.status = "opened";
    }

    await recipient.update(updateData);

    // Crear evento de tracking
    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "open",
      eventData: metadata,
      ipAddress: metadata.ip || null,
      userAgent: metadata.userAgent || null,
      deviceType: metadata.deviceType || null,
      emailClient: metadata.emailClient || null,
      timestamp: new Date()
    });

    // Incrementar totalOpened en la campana
    await EmailCampaign.increment("totalOpened", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Open registrado — recipient: ${recipientId}, campaign: ${recipient.campaignId}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackOpen recipient ${recipientId}: ${err.message}`
    );
  }
};

/**
 * Registrar click en link
 */
export const trackClick = async (
  recipientId: number,
  linkUrl: string,
  metadata: TrackingMetadata
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackClick`);
      return;
    }

    // Incrementar clickCount
    await recipient.increment("clickCount", { by: 1 });

    // Actualizar timestamps
    const updateData: Record<string, unknown> = {
      clickedAt: new Date()
    };

    if (!recipient.firstClickedAt) {
      updateData.firstClickedAt = new Date();
    }

    // Actualizar status si era sent/delivered/opened
    if (["sent", "delivered", "opened"].includes(recipient.status)) {
      updateData.status = "clicked";
    }

    await recipient.update(updateData);

    // Crear evento de tracking
    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "click",
      eventData: { ...metadata, linkUrl },
      ipAddress: metadata.ip || null,
      userAgent: metadata.userAgent || null,
      deviceType: metadata.deviceType || null,
      emailClient: metadata.emailClient || null,
      linkUrl,
      timestamp: new Date()
    });

    // Incrementar totalClicked en la campana
    await EmailCampaign.increment("totalClicked", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Click registrado — recipient: ${recipientId}, url: ${linkUrl}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackClick recipient ${recipientId}: ${err.message}`
    );
  }
};

/**
 * Registrar bounce (rebote)
 */
export const trackBounce = async (
  recipientId: number,
  bounceType: string,
  bounceReason: string
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackBounce`);
      return;
    }

    // Actualizar recipient con datos de bounce
    await recipient.update({
      status: "bounced",
      bouncedAt: new Date(),
      bounceType,
      bounceReason
    });

    // Crear evento de tracking
    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "bounce",
      eventData: { bounceType, bounceReason },
      timestamp: new Date()
    });

    // Incrementar totalBounced en la campana
    await EmailCampaign.increment("totalBounced", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Bounce registrado — recipient: ${recipientId}, tipo: ${bounceType}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackBounce recipient ${recipientId}: ${err.message}`
    );
  }
};

/**
 * Registrar unsubscribe (desuscripcion)
 */
export const trackUnsubscribe = async (
  recipientId: number
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackUnsubscribe`);
      return;
    }

    // Actualizar recipient
    await recipient.update({
      unsubscribedAt: new Date(),
      status: "unsubscribed"
    });

    // Crear evento de tracking
    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "unsubscribe",
      eventData: {},
      timestamp: new Date()
    });

    // Incrementar totalUnsubscribed en la campana
    await EmailCampaign.increment("totalUnsubscribed", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Unsubscribe registrado — recipient: ${recipientId}, campaign: ${recipient.campaignId}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackUnsubscribe recipient ${recipientId}: ${err.message}`
    );
  }
};

/**
 * Registrar delivery (entrega exitosa)
 */
export const trackDelivery = async (
  recipientId: number
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackDelivery`);
      return;
    }

    // Solo actualizar si el status era 'sent'
    const updateData: Record<string, unknown> = {
      deliveredAt: new Date()
    };

    if (recipient.status === "sent") {
      updateData.status = "delivered";
    }

    await recipient.update(updateData);

    // Crear evento de tracking
    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "delivery",
      eventData: {},
      timestamp: new Date()
    });

    // Incrementar totalDelivered en la campana
    await EmailCampaign.increment("totalDelivered", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Delivery registrado — recipient: ${recipientId}, campaign: ${recipient.campaignId}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackDelivery recipient ${recipientId}: ${err.message}`
    );
  }
};

/**
 * Registrar spam complaint
 */
export const trackSpamComplaint = async (
  recipientId: number
): Promise<void> => {
  try {
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient) {
      logger.warn(`[TrackingService] Recipient ${recipientId} no encontrado para trackSpamComplaint`);
      return;
    }

    await recipient.update({
      spamComplaintAt: new Date(),
      status: "spam_complaint"
    });

    await EmailTrackingEvent.create({
      recipientId: recipient.id,
      campaignId: recipient.campaignId,
      companyId: recipient.companyId,
      eventType: "spam_complaint",
      eventData: {},
      timestamp: new Date()
    });

    await EmailCampaign.increment("totalSpamComplaints", {
      by: 1,
      where: { id: recipient.campaignId }
    });

    logger.info(
      `[TrackingService] Spam complaint registrado — recipient: ${recipientId}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[TrackingService] Error en trackSpamComplaint recipient ${recipientId}: ${err.message}`
    );
  }
};

// ============================================================================
// BATCH TRACKING — Optimizado para webhooks con múltiples eventos
// ============================================================================

interface BatchTrackingEvent {
  recipientId: number;
  eventType: "open" | "click" | "bounce" | "unsubscribe" | "delivery" | "spam_complaint";
  metadata?: TrackingMetadata;
  bounceType?: string;
  bounceReason?: string;
  linkUrl?: string;
}

/**
 * Procesa múltiples eventos de tracking en batch (optimizado para webhooks).
 * En lugar de 1 query por evento, carga todos los recipients en 1 query
 * y procesa las actualizaciones agrupadas.
 */
export const trackBatch = async (
  events: BatchTrackingEvent[]
): Promise<{ processed: number; skipped: number }> => {
  if (!events.length) return { processed: 0, skipped: 0 };

  try {
    // 1. Extraer IDs únicos de recipients
    const uniqueIds = [...new Set(events.map(e => e.recipientId))];

    // 2. Cargar TODOS los recipients en UNA query
    const recipients = await EmailCampaignRecipient.findAll({
      where: { id: uniqueIds }
    });

    const recipientMap = new Map(recipients.map(r => [r.id, r]));

    let processed = 0;
    let skipped = 0;
    const now = new Date();
    const trackingEventsToCreate: Array<Record<string, unknown>> = [];
    const campaignIncrements: Record<number, Record<string, number>> = {};

    // 3. Procesar cada evento
    for (const event of events) {
      const recipient = recipientMap.get(event.recipientId);
      if (!recipient) {
        skipped++;
        continue;
      }

      const campaignId = recipient.campaignId;
      if (!campaignIncrements[campaignId]) {
        campaignIncrements[campaignId] = {};
      }

      // Preparar tracking event para bulkCreate
      trackingEventsToCreate.push({
        recipientId: recipient.id,
        campaignId: recipient.campaignId,
        companyId: recipient.companyId,
        eventType: event.eventType,
        eventData: {
          ...(event.linkUrl && { linkUrl: event.linkUrl }),
          ...(event.bounceType && { bounceType: event.bounceType }),
          ...(event.bounceReason && { bounceReason: event.bounceReason })
        },
        ipAddress: event.metadata?.ip || null,
        userAgent: event.metadata?.userAgent || null,
        deviceType: event.metadata?.deviceType || null,
        emailClient: event.metadata?.emailClient || null,
        timestamp: now
      });

      // Actualizar recipient según tipo de evento
      switch (event.eventType) {
        case "open":
          await recipient.increment("openCount", { by: 1 });
          if (!recipient.firstOpenedAt) {
            await recipient.update({ firstOpenedAt: now, openedAt: now });
          } else {
            await recipient.update({ openedAt: now });
          }
          campaignIncrements[campaignId]["totalOpened"] =
            (campaignIncrements[campaignId]["totalOpened"] || 0) + 1;
          break;

        case "click":
          await recipient.increment("clickCount", { by: 1 });
          if (!recipient.firstClickedAt) {
            await recipient.update({ firstClickedAt: now, clickedAt: now });
          } else {
            await recipient.update({ clickedAt: now });
          }
          campaignIncrements[campaignId]["totalClicked"] =
            (campaignIncrements[campaignId]["totalClicked"] || 0) + 1;
          break;

        case "bounce":
          await recipient.update({
            bouncedAt: now,
            bounceType: event.bounceType || "unknown",
            bounceReason: event.bounceReason || "",
            status: "bounced"
          });
          campaignIncrements[campaignId]["totalBounced"] =
            (campaignIncrements[campaignId]["totalBounced"] || 0) + 1;
          break;

        case "unsubscribe":
          await recipient.update({ unsubscribedAt: now, status: "unsubscribed" });
          campaignIncrements[campaignId]["totalUnsubscribed"] =
            (campaignIncrements[campaignId]["totalUnsubscribed"] || 0) + 1;
          break;

        case "delivery":
          await recipient.update({ deliveredAt: now, status: "delivered" });
          campaignIncrements[campaignId]["totalDelivered"] =
            (campaignIncrements[campaignId]["totalDelivered"] || 0) + 1;
          break;

        case "spam_complaint":
          await recipient.update({ spamComplaintAt: now, status: "spam_complaint" });
          campaignIncrements[campaignId]["totalSpamComplaints"] =
            (campaignIncrements[campaignId]["totalSpamComplaints"] || 0) + 1;
          break;
      }

      processed++;
    }

    // 4. Bulk insert tracking events
    if (trackingEventsToCreate.length > 0) {
      await EmailTrackingEvent.bulkCreate(trackingEventsToCreate as never[]);
    }

    // 5. Actualizar contadores de campaign en batch
    for (const [campaignId, increments] of Object.entries(campaignIncrements)) {
      for (const [field, count] of Object.entries(increments)) {
        await EmailCampaign.increment(field, {
          by: count,
          where: { id: Number(campaignId) }
        });
      }
    }

    logger.info(
      `[TrackingService] Batch procesado — ${processed} ok, ${skipped} omitidos de ${events.length} eventos`
    );

    return { processed, skipped };
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[TrackingService] Error en trackBatch: ${err.message}`);
    return { processed: 0, skipped: events.length };
  }
};
