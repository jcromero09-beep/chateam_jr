import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Job: EmailCampaign
 *
 * Orquesta el envio de una campana de email marketing en modo individual_queue.
 *
 * Modo provider_native (Listmonk/Acelle):
 *   El job NO se invoca; la campana ya esta corriendo en el provider externo.
 *   Solo se actualizan los analytics via job ListmonkAnalyticsSync.
 *
 * Modo individual_queue (sendIntervalSeconds > 0):
 *   1. Carga la campana y la lista de contactos
 *   2. Crea EmailCampaignRecipient si no existen (idempotente)
 *   3. Encola cada recipient a EmailSendQueue con delay incremental:
 *      delay = index * sendIntervalSeconds * 1000
 *   4. Actualiza totalRecipients y status
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface EmailCampaignJobData {
  companyId: number;
  campaignId: number;
  userId?: number;
}

const handle = async (
  job: Job<EmailCampaignJobData>
): Promise<{ campaignId: number; totalEnqueued: number; dispatchMode: string }> => {
  const { companyId, campaignId } = job.data;

  logger.info(
    `[EmailCampaign] Iniciando orquestacion: campaignId=${campaignId}, company=${companyId}`
  );

  // Lazy load para evitar import cycles
  const EmailCampaign = require("../models/EmailMarketing/EmailCampaign").default;
  const EmailCampaignRecipient = require("../models/EmailMarketing/EmailCampaignRecipient").default;
  const ContactListItem = require("../models/ContactListItem").default;
  const { add } = require("../queues");

  const campaign = await EmailCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    logger.error(`[EmailCampaign] Campana no encontrada: ${campaignId}`);
    throw new Error(`Campana ${campaignId} no encontrada`);
  }

  // Si la campana es provider_native, NO necesita queue
  if (campaign.dispatchMode === "provider_native") {
    logger.info(
      `[EmailCampaign] Campana ${campaignId} es provider_native; el envio se hace en el provider externo. Skip queue.`
    );
    return { campaignId, totalEnqueued: 0, dispatchMode: "provider_native" };
  }

  // Modo individual_queue
  const sendIntervalSeconds = Number(campaign.sendIntervalSeconds || 0);
  const intervalMs = sendIntervalSeconds * 1000;

  // 1. Asegurar recipients existen (crear desde ContactList si no)
  let recipients = await EmailCampaignRecipient.findAll({
    where: { campaignId, status: ["pending", "queued"] }
  });

  if (recipients.length === 0) {
    // Crear recipients desde la lista de contactos
    if (!campaign.contactListId) {
      logger.warn(
        `[EmailCampaign] Campana ${campaignId} no tiene contactListId; nada que enviar.`
      );
      await campaign.update({ status: "FINALIZADA", completedAt: new Date() });
      return { campaignId, totalEnqueued: 0, dispatchMode: "individual_queue" };
    }

    const contacts = await ContactListItem.findAll({
      where: { contactListId: campaign.contactListId, companyId }
    });
    const valid = contacts.filter(
      (c: { email: string }) => c.email && c.email.trim() !== ""
    );

    if (valid.length === 0) {
      logger.warn(
        `[EmailCampaign] La lista ${campaign.contactListId} no tiene contactos con email valido`
      );
      await campaign.update({ status: "FINALIZADA", completedAt: new Date() });
      return { campaignId, totalEnqueued: 0, dispatchMode: "individual_queue" };
    }

    const created = await EmailCampaignRecipient.bulkCreate(
      valid.map((c: { id: number; email: string; name: string }) => ({
        campaignId,
        companyId,
        contactListItemId: c.id,
        email: c.email,
        name: c.name || c.email.split("@")[0],
        status: "pending"
      })),
      { ignoreDuplicates: true }
    );

    recipients = created.length > 0
      ? created
      : await EmailCampaignRecipient.findAll({ where: { campaignId, status: "pending" } });
  }

  logger.info(
    `[EmailCampaign] Recipients para encolar: ${recipients.length}, ` +
    `intervalMs=${intervalMs}, totalDuration=${(recipients.length * intervalMs / 1000).toFixed(1)}s`
  );

  await campaign.update({
    totalRecipients: recipients.length,
    status: "EN_ANDAMENTO"
  });

  let totalEnqueued = 0;
  const settings = (campaign.settings || {}) as Record<string, string | undefined>;
  const fromEmail = settings.fromEmail || campaign.fromEmail || "";
  const fromName = settings.fromName || campaign.fromName || campaign.name || "";
  const replyTo = settings.replyTo;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const delay = intervalMs > 0 ? i * intervalMs : 0;

    try {
      await add("EmailSendQueue", {
        companyId,
        campaignId,
        recipientId: r.id,
        to: r.email,
        toName: r.name,
        subject: campaign.subject,
        htmlContent: campaign.htmlContent,
        textContent: campaign.textContent || undefined,
        from: fromEmail,
        fromName,
        replyTo
      }, { delay });

      // Marcar como queued
      await r.update({ status: "queued" });
      totalEnqueued++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[EmailCampaign] Error encolando recipient ${r.id}: ${msg}`);
      await r.update({ status: "failed", errorMessage: msg }).catch(() => undefined);
    }
  }

  logger.info(
    `[EmailCampaign] Orquestacion completada: campaignId=${campaignId}, ` +
    `totalEnqueued=${totalEnqueued}/${recipients.length}, mode=individual_queue`
  );

  return { campaignId, totalEnqueued, dispatchMode: "individual_queue" };
};

export default handle;
