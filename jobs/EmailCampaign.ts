/**
 * Job: EmailCampaign
 * Orquesta el envio de una campana de email marketing.
 *
 * Flujo:
 * 1. Carga la campana y valida que exista
 * 2. Carga todos los recipients pendientes
 * 3. Divide recipients en batches de 50
 * 4. Por cada recipient, agrega un job a EmailSendQueue con los datos del email
 * 5. Actualiza el totalRecipients de la campana
 * 6. Registra progreso via logs
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface EmailCampaignJobData {
  companyId: number;
  campaignId: number;
  userId: number;
}

const BATCH_SIZE = 50;

const handle = async (job: Job<EmailCampaignJobData>): Promise<{ campaignId: number; totalEnqueued: number }> => {
  const { companyId, campaignId, userId } = job.data;

  logger.info(
    `[EmailCampaign] Iniciando orquestacion de campana: ` +
    `campaignId=${campaignId}, company=${companyId}, userId=${userId}`
  );

  // Lazy load de modelos y cola
  const EmailCampaignModel = require("../models/EmailMarketing/EmailCampaign").default;
  const EmailCampaignRecipient = require("../models/EmailMarketing/EmailCampaignRecipient").default;
  const { add } = require("../queues");

  // 1. Cargar la campana
  const campaign = await EmailCampaignModel.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    logger.error(`[EmailCampaign] Campana no encontrada: id=${campaignId}, company=${companyId}`);
    throw new Error(`Campana ${campaignId} no encontrada para company ${companyId}`);
  }

  logger.info(
    `[EmailCampaign] Campana cargada: name="${campaign.name}", ` +
    `status=${campaign.status}, from=${campaign.fromEmail}`
  );

  // 2. Cargar todos los recipients pendientes
  const recipients = await EmailCampaignRecipient.findAll({
    where: { campaignId, status: "pending" }
  });

  if (recipients.length === 0) {
    logger.warn(`[EmailCampaign] No hay recipients pendientes para campana ${campaignId}`);

    await campaign.update({
      status: "FINALIZADA",
      completedAt: new Date()
    });

    return { campaignId, totalEnqueued: 0 };
  }

  logger.info(
    `[EmailCampaign] Recipients pendientes encontrados: ${recipients.length}`
  );

  // 3. Actualizar totalRecipients de la campana
  await campaign.update({
    totalRecipients: recipients.length,
    status: "EN_ANDAMENTO"
  });

  // 4. Dividir en batches y encolar
  let totalEnqueued = 0;
  const totalBatches = Math.ceil(recipients.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, recipients.length);
    const batch = recipients.slice(start, end);

    logger.info(
      `[EmailCampaign] Procesando batch ${batchIndex + 1}/${totalBatches}: ` +
      `${batch.length} recipients (${start + 1}-${end} de ${recipients.length})`
    );

    for (const recipient of batch) {
      try {
        await add("EmailSendQueue", {
          companyId,
          campaignId,
          recipientId: recipient.id,
          to: recipient.email,
          toName: recipient.name || undefined,
          subject: campaign.subject,
          htmlContent: campaign.htmlContent,
          textContent: campaign.textContent || undefined,
          from: campaign.fromEmail,
          fromName: campaign.fromName || campaign.name,
          replyTo: campaign.replyToEmail || undefined
        });

        totalEnqueued++;
      } catch (enqueueError: unknown) {
        const enqueueMsg = enqueueError instanceof Error ? enqueueError.message : String(enqueueError);
        logger.error(
          `[EmailCampaign] Error encolando recipient ${recipient.id}: ${enqueueMsg}`
        );
      }
    }

    logger.info(
      `[EmailCampaign] Batch ${batchIndex + 1}/${totalBatches} completado: ` +
      `${totalEnqueued} emails encolados en total`
    );
  }

  logger.info(
    `[EmailCampaign] Orquestacion completada: campaignId=${campaignId}, ` +
    `totalRecipients=${recipients.length}, totalEnqueued=${totalEnqueued}`
  );

  return { campaignId, totalEnqueued };
};

export default handle;
