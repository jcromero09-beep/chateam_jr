import TelegramBotAPI from "./TelegramBotAPI";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import logger from "../../utils/logger";
import telegramLogger from "../../utils/telegramLogger";

interface SendFarewellMessageRequest {
  ticket: any;
  telegram: Whatsapp;
}

interface SendRatingMessageRequest {
  ticket: any;
  telegram: Whatsapp;
}

/**
 * Envía mensaje de despedida cuando se cierra un ticket de Telegram
 */
export const sendTelegramFarewellMessage = async ({
  ticket,
  telegram
}: SendFarewellMessageRequest): Promise<void> => {
  try {
    if (!telegram.farewellMessage || telegram.farewellMessage.trim() === '') {
      telegramLogger.debug("No hay mensaje de despedida configurado", {
        telegramId: telegram.id,
        ticketId: ticket.id
      });
      return;
    }

    const telegramAPI = new TelegramBotAPI(telegram.botToken);
    const chatId = ticket.contact.telegramUserId;

    // Enviar mensaje de despedida
    const response = await telegramAPI.sendMessage({
      chat_id: chatId,
      text: telegram.farewellMessage
    });

    // Crear registro en DB
    const messageData = {
      wid: `telegram_farewell_${response.message_id}_${Date.now()}`,
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body: telegram.farewellMessage,
      fromMe: true,
      read: true,
      mediaType: "chat",
      ack: 3,
      channel: "telegram"
    };

    await CreateMessageService({
      messageData,
      companyId: ticket.companyId
    });

    telegramLogger.info("Mensaje de despedida enviado", {
      telegramId: telegram.id,
      ticketId: ticket.id,
      messageId: response.message_id
    });

  } catch (error: any) {
    telegramLogger.error("Error enviando mensaje de despedida", error, {
      telegramId: telegram.id,
      ticketId: ticket.id
    });
  }
};

/**
 * Envía mensaje de calificación cuando se cierra un ticket de Telegram
 */
export const sendTelegramRatingMessage = async ({
  ticket,
  telegram
}: SendRatingMessageRequest): Promise<void> => {
  try {
    if (!telegram.ratingMessage || telegram.ratingMessage.trim() === '') {
      telegramLogger.debug("No hay mensaje de calificación configurado", {
        telegramId: telegram.id,
        ticketId: ticket.id
      });
      return;
    }

    const telegramAPI = new TelegramBotAPI(telegram.botToken);
    const chatId = ticket.contact.telegramUserId;

    // Enviar mensaje de calificación
    const response = await telegramAPI.sendMessage({
      chat_id: chatId,
      text: telegram.ratingMessage
    });

    // Crear registro en DB
    const messageData = {
      wid: `telegram_rating_${response.message_id}_${Date.now()}`,
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body: telegram.ratingMessage,
      fromMe: true,
      read: true,
      mediaType: "chat",
      ack: 3,
      channel: "telegram"
    };

    await CreateMessageService({
      messageData,
      companyId: ticket.companyId
    });

    telegramLogger.info("Mensaje de calificación enviado", {
      telegramId: telegram.id,
      ticketId: ticket.id,
      messageId: response.message_id
    });

  } catch (error: any) {
    telegramLogger.error("Error enviando mensaje de calificación", error, {
      telegramId: telegram.id,
      ticketId: ticket.id
    });
  }
};

/**
 * Procesa el cierre de un ticket de Telegram enviando mensajes automáticos
 */
export const processTelegramTicketClosure = async (ticket: any): Promise<void> => {
  try {
    // Solo procesar tickets de Telegram
    if (ticket.channel !== "telegram" || !ticket.whatsappId) {
      return;
    }

    telegramLogger.info("Procesando cierre de ticket de Telegram", {
      ticketId: ticket.id,
      whatsappId: ticket.whatsappId,
      status: ticket.status
    });

    const telegram = await Whatsapp.findOne({
      where: {
        id: ticket.whatsappId,
        channel: "telegram"
      }
    });
    
    if (!telegram) {
      telegramLogger.error("Bot de Telegram no encontrado para ticket", new Error("Telegram bot not found"), {
        ticketId: ticket.id,
        whatsappId: ticket.whatsappId
      });
      return;
    }

    // Enviar mensaje de despedida
    await sendTelegramFarewellMessage({ ticket, telegram });

    // Esperar un poco antes de enviar calificación
    setTimeout(async () => {
      await sendTelegramRatingMessage({ ticket, telegram });
    }, 2000); // 2 segundos de delay

  } catch (error: any) {
    telegramLogger.error("Error procesando cierre de ticket de Telegram", error, {
      ticketId: ticket.id,
      whatsappId: ticket.whatsappId
    });
  }
};

export default {
  sendTelegramFarewellMessage,
  sendTelegramRatingMessage,
  processTelegramTicketClosure
};
