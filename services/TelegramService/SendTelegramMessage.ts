import path from "path";
import fs from "fs";
import mime from "mime";
import TelegramBotAPI from "./TelegramBotAPI";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { getIO } from "../../libs/socket";

interface Request {
  body: string;
  ticket: any;
  quotedMsg?: any;
  mediaPath?: string;
  mediaName?: string;
}

interface Response {
  message_id: number;
}

const SendTelegramMessage = async ({
  body,
  ticket,
  quotedMsg,
  mediaPath,
  mediaName
}: Request): Promise<Response> => {
  // Buscar primero en modelo WhatsApp (para cuando se migre)
  const whatsapp = await Whatsapp.findOne({
    where: {
      id: ticket.whatsappId,
      channel: "telegram"
    }
  });

  // Si no se encuentra, buscar en modelo Telegram original
  let telegramBot: any = null;
  if (!whatsapp && ticket.telegramId) {
    // Import dinámico: preserva la carga diferida (rompe-ciclos con Telegram) y
    // funciona en ESM (tsx) y CJS (ts-jest transpila import() a require).
    const Telegram = (await import("../../models/Telegram")).default;
    telegramBot = await Telegram.findByPk(ticket.telegramId);
  }

  if (!whatsapp && !telegramBot) {
    throw new Error("Bot Telegram no encontrado");
  }

  const botToken = whatsapp?.botToken || telegramBot?.botToken;
  const telegramAPI = new TelegramBotAPI(botToken);
  const chatId = ticket.contact.telegramUserId;

  try {
    let telegramResponse: any;
    let mediaType = "chat";
    let mediaUrl: string | undefined;

    // Se tem mídia anexada
    if (mediaPath) {
      const mediaData = fs.readFileSync(mediaPath);
      const mediaBase64 = mediaData.toString('base64');
      // Usar mime.lookup en lugar de mime.getType
      const mimeType = mime.lookup(mediaPath) as string | false;
      const fileName = mediaName || path.basename(mediaPath);

      // Determinar tipo de mídia
      if (typeof mimeType === 'string' && mimeType.startsWith('image/')) {
        // Enviar como foto
        telegramResponse = await telegramAPI.sendPhoto({
          chat_id: chatId,
          photo: `data:${mimeType};base64,${mediaBase64}`,
          caption: body || undefined,
          reply_to_message_id: quotedMsg?.message_id
        });
        mediaType = "image";
        
      } else {
        // Enviar como documento
        telegramResponse = await telegramAPI.sendDocument({
          chat_id: chatId,
          document: `data:${mimeType};base64,${mediaBase64}`,
          caption: body || undefined,
          reply_to_message_id: quotedMsg?.message_id
        });
        mediaType = "document";
      }

      // Crear URL relativa para el archivo
      mediaUrl = `/public/company${ticket.companyId}/${fileName}`;
    } 
    // Apenas texto
    else if (body && body.trim() !== "") {
      telegramResponse = await telegramAPI.sendMessage({
        chat_id: chatId,
        text: body.trim(),
        reply_to_message_id: quotedMsg?.message_id
      });
    } else {
      throw new Error("No hay contenido para enviar");
    }

    // NUEVO: Crear registro del mensaje en la base de datos
    const messageData = {
      wid: `telegram_${telegramResponse.message_id}_${Date.now()}`,
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body: body || (mediaName ? `📎 ${mediaName}` : "Media"),
      fromMe: true,
      read: true,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      quotedMsgId: quotedMsg?.id?.toString(),
      ack: 3, // Entregado
      channel: "telegram"
    };

    // Crear mensaje en DB
    const message = await CreateMessageService({
      messageData,
      companyId: ticket.companyId
    });

    logger.info(`Mensaje de Telegram enviado exitosamente - Ticket: ${ticket.id}, MessageId: ${telegramResponse.message_id}`);

    return { message_id: telegramResponse.message_id };

  } catch (error: any) {
    logger.error({ error: error.message }, "Error al enviar mensaje Telegram");
    throw error;
  }
};

export default SendTelegramMessage;
