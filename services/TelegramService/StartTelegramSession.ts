import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";
import telegramLogger from "../../utils/telegramLogger";
import { tokenFingerprint } from "../../utils/tokenFingerprint";

interface TelegramBotInfo {
  ok: boolean;
  result: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
  };
}

interface TelegramWebhookResponse {
  ok: boolean;
  result: boolean;
  description?: string;
}

/**
 * Determina la URL base según el entorno
 */
const getBackendUrl = (): string => {
  const backendUrl = process.env.BACKEND_URL;
  
  if (!backendUrl) {
    throw new Error("BACKEND_URL no está configurado en las variables de entorno");
  }

  // Validar que la URL sea HTTPS (requerido por Telegram)
  if (!backendUrl.startsWith('https://')) {
    throw new Error("BACKEND_URL debe usar HTTPS para webhooks de Telegram");
  }

  return backendUrl;
};

/**
 * Verifica si debe usar webhook o polling
 */
const shouldUseWebhook = (): boolean => {
  // Usar webhook siempre que BACKEND_URL esté configurado y sea HTTPS
  try {
    const backendUrl = getBackendUrl();
    return true;
  } catch {
    return false;
  }
};

const StartTelegramSession = async (
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  const { botToken, id: telegramId } = whatsapp;

  try {
    // telegramlogInfo(`🤖 Iniciando sesión Telegram Bot`, {
    //   telegramId,
    //   companyId,
    //   botName: whatsapp.name,
    //   environment: process.env.NODE_ENV || 'development',
    //   backendUrl: process.env.BACKEND_URL
    // });

    // 1. Verificar si el token del bot es válido
    const botInfoResponse = await axios.get<TelegramBotInfo>(
      `https://api.telegram.org/bot${botToken}/getMe`
    );

    if (!botInfoResponse.data.ok) {
      throw new Error("Token del bot inválido");
    }

    const botInfo = botInfoResponse.data.result;
    // telegramlogInfo(`✅ Bot autenticado exitosamente`, {
    //   telegramId,
    //   botUsername: botInfo.username,
    //   botFirstName: botInfo.first_name,
    //   botId: botInfo.id,
    //   canJoinGroups: botInfo.can_join_groups
    // });

    // 2. Configurar webhook si es posible, sino usar polling
    if (shouldUseWebhook()) {
      await configureWebhook(whatsapp, botInfo, telegramId);
    } else {
      await configurePolling(whatsapp, botInfo, telegramId);
    }

    // telegramlogInfo(`🎉 Sesión Telegram iniciada exitosamente`, {
    //   telegramId,
    //   botUsername: botInfo.username,
    //   companyId,
    //   method: shouldUseWebhook() ? 'webhook' : 'polling'
    // });

  } catch (error: any) {
    telegramLogger.error(`❌ Error al iniciar sesión Telegram Bot`, error, {
      telegramId,
      companyId,
      botToken: tokenFingerprint(botToken),
      errorMessage: error.message
    });
    
    await whatsapp.update({
      status: "ERROR"
    });

    throw error;
  }
};

/**
 * Configura webhook para el bot
 */
const configureWebhook = async (
  whatsapp: Whatsapp,
  botInfo: any,
  telegramId: number
): Promise<void> => {
  const backendUrl = getBackendUrl();
  const webhookUrl = `${backendUrl}/telegram/webhook/${telegramId}`;
  
  // telegramlogInfo(`🔗 Configurando webhook`, {
  //   telegramId,
  //   webhookUrl,
  //   botUsername: botInfo.username
  // });

  try {
    const webhookResponse = await axios.post<TelegramWebhookResponse>(
      `https://api.telegram.org/bot${whatsapp.botToken}/setWebhook`,
      {
        url: webhookUrl,
        allowed_updates: [
          "message",
          "edited_message", 
          "channel_post",
          "edited_channel_post",
          "callback_query"
        ],
        drop_pending_updates: true // Limpiar mensajes pendientes
      }
    );

    if (webhookResponse.data.ok) {
      // telegramlogInfo(`✅ Webhook configurado exitosamente`, {
      //   telegramId,
      //   webhookUrl,
      //   botUsername: botInfo.username
      // });

      await whatsapp.update({
        webhookUrl,
        botUsername: botInfo.username,
        status: "CONNECTED"
      });
    } else {
      const errorMessage = webhookResponse.data.description || "Error desconocido";
      telegramLogger.error(`❌ Error al configurar webhook`, new Error(errorMessage), {
        telegramId,
        webhookUrl,
        errorDescription: errorMessage
      });
      throw new Error(`Error al configurar webhook: ${errorMessage}`);
    }
  } catch (error: any) {
    telegramLogger.error(`❌ Error al configurar webhook (detalle)`, error, {
      telegramId,
      webhookUrl,
      botUsername: botInfo.username,
      errorMessage: error.message,
      errorCode: error.response?.status,
      errorData: error.response?.data,
      axiosError: error.isAxiosError
    });
    
    // Re-lanzar el error para que sea manejado por el nivel superior
    throw error;
  }
};

/**
 * Configura polling para el bot (modo desarrollo)
 */
const configurePolling = async (
  whatsapp: Whatsapp,
  botInfo: any,
  telegramId: number
): Promise<void> => {
  // telegramlogWarn(`⚠️ Configurando modo polling (desarrollo)`, {
  //   telegramId,
  //   botUsername: botInfo.username,
  //   reason: "BACKEND_URL no disponible o no es HTTPS"
  // });

  // Primero eliminar cualquier webhook existente
  await axios.post(
    `https://api.telegram.org/bot${whatsapp.botToken}/deleteWebhook`,
    { drop_pending_updates: true }
  );

  await whatsapp.update({
    webhookUrl: null,
    botUsername: botInfo.username,
    status: "CONNECTED"
  });

  // telegramlogInfo(`✅ Modo polling configurado`, {
  //   telegramId,
  //   botUsername: botInfo.username,
  //   note: "Para producción, configure BACKEND_URL con HTTPS"
  // });

  // TODO: Implementar polling si es necesario
  // startTelegramPolling(telegram);
};

export default StartTelegramSession;

