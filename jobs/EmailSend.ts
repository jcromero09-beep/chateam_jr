/**
 * Job: EmailSend
 * Procesa el envio individual de un email via el proveedor configurado de la company.
 *
 * Flujo:
 * 1. Obtiene el proveedor de email via ProviderFactory
 * 2. Envia el email con provider.sendEmail()
 * 3. Actualiza EmailCampaignRecipient: status='sent', sentAt, providerMessageId
 * 4. Si falla: actualiza status='failed', errorMessage
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface EmailSendJobData {
  companyId: number;
  campaignId: number;
  recipientId: number;
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  from: string;
  fromName: string;
  replyTo?: string;
}

const handle = async (job: Job<EmailSendJobData>): Promise<{ recipientId: number; status: string }> => {
  const {
    companyId,
    campaignId,
    recipientId,
    to,
    toName,
    subject,
    htmlContent,
    textContent,
    from,
    fromName,
    replyTo
  } = job.data;

  logger.info(
    `[EmailSend] Iniciando envio: recipientId=${recipientId}, ` +
    `campaignId=${campaignId}, company=${companyId}, to=${to}`
  );

  // Lazy load de modelos y ProviderFactory para evitar dependencias circulares
  const EmailCampaignRecipient = require("../models/EmailMarketing/EmailCampaignRecipient").default;
  const { ProviderFactory } = require("../services/EmailMarketing/providers/ProviderFactory");

  // Buscar el recipient
  const recipient = await EmailCampaignRecipient.findOne({
    where: { id: recipientId, companyId }
  });

  if (!recipient) {
    logger.error(`[EmailSend] Recipient no encontrado: id=${recipientId}, company=${companyId}`);
    throw new Error(`Recipient ${recipientId} no encontrado`);
  }

  // Si ya fue enviado, omitir
  if (recipient.status === "sent") {
    logger.warn(`[EmailSend] Recipient ${recipientId} ya fue enviado, omitiendo`);
    return { recipientId, status: "already_sent" };
  }

  try {
    // Obtener el proveedor de email configurado para la company
    const provider = await ProviderFactory.getProvider(companyId);

    logger.info(
      `[EmailSend] Enviando email via ${provider.getProviderName()}: ` +
      `to=${to}, subject="${subject.substring(0, 80)}..."`
    );

    // Enviar el email
    const response = await provider.sendEmail({
      to,
      toName,
      from,
      fromName,
      replyTo,
      subject,
      htmlContent,
      textContent
    });

    if (response.success) {
      // Actualizar recipient como enviado
      await recipient.update({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: response.messageId || response.providerId || null
      });

      logger.info(
        `[EmailSend] Email enviado exitosamente: recipientId=${recipientId}, ` +
        `messageId=${response.messageId || response.providerId || "N/A"}`
      );

      return { recipientId, status: "sent" };
    } else {
      // El proveedor retorno success=false
      const errorMsg = response.error || "Error desconocido del proveedor";

      await recipient.update({
        status: "failed",
        errorMessage: errorMsg
      });

      logger.error(
        `[EmailSend] Proveedor retorno error: recipientId=${recipientId}, error=${errorMsg}`
      );

      throw new Error(errorMsg);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Actualizar recipient como fallido
    try {
      await recipient.update({
        status: "failed",
        errorMessage: errorMessage.substring(0, 500)
      });
    } catch (updateErr: unknown) {
      const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      logger.error(
        `[EmailSend] Error actualizando estado a failed: ${updateMsg}`
      );
    }

    logger.error(
      `[EmailSend] Error enviando email: recipientId=${recipientId}, ` +
      `to=${to}, error=${errorMessage}`
    );

    // Re-throw para que Bull registre el fallo y aplique retry
    throw error;
  }
};

export default handle;
