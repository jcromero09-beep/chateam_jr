import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { EmailMessage, SendEmailResponse } from "./providers/BaseEmailProvider";
import { ProviderFactory } from "./providers/ProviderFactory";

// ============================================================================
// Interfaces
// ============================================================================

interface SendEmailRequest {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  campaignId?: number;
  recipientId?: number;
}

interface SendEmailServiceResponse {
  success: boolean;
  messageId?: string;
  providerId?: string;
  provider: string;
  creditsDeducted: number;
}

// ============================================================================
// SendEmailService — Envio individual de email con deduccion de creditos
// ============================================================================

/**
 * Servicio central para enviar un email individual.
 * - Obtiene el proveedor configurado para la company
 * - Deduce 1 credito 'email_send' antes de enviar
 * - Envia el email via el proveedor
 * - Retorna respuesta con detalles del envio
 */
const SendEmailService = async (
  companyId: number,
  message: SendEmailRequest
): Promise<SendEmailServiceResponse> => {

  // 1. Obtener proveedor configurado
  const provider = await ProviderFactory.getProvider(companyId);

  // 2. Deducir credito de email antes de enviar
  try {
    await DeductCreditsService({
      companyId,
      creditTypeKey: "email_send",
      amount: 1,
      description: `Envio de email a ${message.to}`,
      source: "email",
      sourceId: message.campaignId ? String(message.campaignId) : String(message.recipientId || "direct")
    });
  } catch (error: unknown) {
    if (error instanceof AppError && error.statusCode === 402) {
      throw new AppError("Creditos de email insuficientes", 402);
    }
    throw error;
  }

  // 3. Construir mensaje para el proveedor
  const emailMessage: EmailMessage = {
    to: message.to,
    toName: message.toName,
    subject: message.subject,
    htmlContent: message.htmlContent,
    textContent: message.textContent,
    from: message.from || "",
    fromName: message.fromName || "",
    replyTo: message.replyTo,
    attachments: message.attachments,
    customArgs: {
      ...(message.campaignId ? { campaignId: String(message.campaignId) } : {}),
      ...(message.recipientId ? { recipientId: String(message.recipientId) } : {})
    }
  };

  // 4. Enviar email
  const response: SendEmailResponse = await provider.sendEmail(emailMessage);

  if (!response.success) {
    logger.error(
      `[SendEmailService] Error al enviar email: company=${companyId}, ` +
      `to=${message.to}, error=${response.error}`
    );
    throw new AppError(
      response.error || "Error al enviar email via proveedor",
      500
    );
  }

  logger.info(
    `[SendEmailService] Email enviado: company=${companyId}, to=${message.to}, ` +
    `messageId=${response.messageId}, provider=${provider.getProviderName()}`
  );

  return {
    success: true,
    messageId: response.messageId,
    providerId: response.providerId,
    provider: provider.getProviderName(),
    creditsDeducted: 1
  };
};

export default SendEmailService;
