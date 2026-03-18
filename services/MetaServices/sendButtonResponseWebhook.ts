import axios from "axios";
import { logInfo, logError } from "../../config/logger";

interface SendButtonWebhookParams {
  webhookUrl: string;
  externalId?: string;
  templateId?: number;
  templateName?: string;
  buttonText: string;
  buttonPayload: string;
  phone: string;
  ticketId: number;
  messageId: number;
  companyId: number;
  whatsappId: number;
}

/**
 * Envía un webhook cuando el usuario toca un botón de plantilla
 */
export const sendButtonResponseWebhook = async (params: SendButtonWebhookParams): Promise<void> => {
  const {
    webhookUrl,
    externalId,
    templateId,
    templateName,
    buttonText,
    buttonPayload,
    phone,
    ticketId,
    messageId,
    companyId,
    whatsappId
  } = params;

  // Validar URL
  if (!webhookUrl) {
    logInfo("🔕 [Webhook] No hay webhookUrl configurado, ignorando");
    return;
  }

  const payload = {
    event: "template_button_response",
    externalId: externalId || null,
    template_id: templateId || null,
    template_name: templateName || null,
    button_text: buttonText,
    button_payload: buttonPayload,
    phone,
    ticket_id: ticketId,
    message_id: messageId,
    company_id: companyId,
    whatsapp_id: whatsappId,
    timestamp: new Date().toISOString()
  };

  logInfo(`[WEBHOOK-BTN] 📤 ENVIANDO | url: ${webhookUrl} | externalId: ${externalId} | button: ${buttonText}`, { payload });

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 10000 // 10 segundos timeout
    });

    logInfo(`[WEBHOOK-BTN] ✅ EXITOSO | externalId: ${externalId} | status: ${response.status}`, { response: response.data });
  } catch (error: any) {
    logError(`[WEBHOOK-BTN] ❌ ERROR | externalId: ${externalId} | error: ${error.message}`, {
      status: error.response?.status,
      response: error.response?.data
    });
  }
};

export default sendButtonResponseWebhook;
