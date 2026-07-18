import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
  // C8 fix: usar el factory ESTRICTO (Listmonk/Acelle). ProviderFactory caía en silencio a
  // Carbonio SMTP ante error/sin-config (canal equivocado, sin tracking).
  const { EmailMarketingFactory } = require("../services/EmailMarketing/providers/EmailMarketingFactory");
  const DeductCreditsService = require("../services/AICreditServices/DeductCreditsService").default;
  const RefundCreditsService = require("../services/AICreditServices/RefundCreditsService").default;

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

  // C2/C6 fix: cobrar 1 crédito 'email_send' por envío, con REEMBOLSO si el envío no se concreta.
  let creditDeducted = false;
  try {
    // C8 fix: factory estricto (lanza si no hay provider Listmonk/Acelle activo, en vez de
    // caer silenciosamente a Carbonio).
    const provider = await EmailMarketingFactory.getProvider(companyId);

    // C2: deducir el crédito ANTES de enviar (fail-closed). Sin saldo → no se envía y NO se
    // reintenta (reintentar sin créditos no ayuda); el recipient queda 'failed'.
    try {
      await DeductCreditsService({
        companyId,
        creditTypeKey: "email_send",
        amount: 1,
        description: `Envío de email de campaña ${campaignId} a ${to}`,
        source: "email",
        sourceId: String(recipientId)
      });
      creditDeducted = true;
    } catch (creditErr: unknown) {
      const cMsg = creditErr instanceof Error ? creditErr.message : String(creditErr);
      await recipient.update({
        status: "failed",
        errorMessage: `Sin créditos de email: ${cMsg}`.substring(0, 500)
      }).catch(() => undefined);
      logger.warn(`[EmailSend] No se envía recipientId=${recipientId} por créditos: ${cMsg}`);
      return { recipientId, status: "no_credits" };
    }

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
    }

    // El proveedor retornó success=false → tratar como fallo (el reembolso ocurre en el catch).
    throw new Error(response.error || "Error desconocido del proveedor");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // C6: reembolsar el crédito si se dedujo pero el email NO se envió.
    if (creditDeducted) {
      await RefundCreditsService({
        companyId,
        creditTypeKey: "email_send",
        amount: 1,
        description: `Reembolso email no enviado (campaña ${campaignId}, recipient ${recipientId})`,
        source: "email",
        sourceId: String(recipientId)
      }).catch((refundErr: unknown) => {
        const rMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        logger.error(`[EmailSend] Error reembolsando crédito recipientId=${recipientId}: ${rMsg}`);
      });
    }

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
