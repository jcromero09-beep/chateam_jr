import logger from "../../utils/logger";
import telegramLogger from "../../utils/telegramLogger";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import TelegramBotAPI, { TelegramUpdate, TelegramMessage } from "./TelegramBotAPI";
import formatBody from "../../helpers/Mustache";
import path from "path";
import fs from "fs";

const TelegramMessageListener = async (
  botInstance: any, // Puede ser Whatsapp o Telegram
  update: TelegramUpdate
): Promise<void> => {
  try {
    telegramLogger.info("🎯 Iniciando procesamiento de mensaje Telegram", {
      telegramId: botInstance.id,
      botName: botInstance.name,
      botUsername: botInstance.botUsername,
      companyId: botInstance.companyId,
      updateId: update.update_id,
      updateType: update.message ? 'message' : update.edited_message ? 'edited_message' : 'other'
    });

    const telegramAPI = new TelegramBotAPI(botInstance.botToken);
    const companyId = botInstance.companyId;
    
    // Procesar mensaje
    const message = update.message || update.edited_message;
    if (!message) {
      telegramLogger.warn("❌ No hay mensaje en el update", {
        telegramId: botInstance.id,
        updateId: update.update_id,
        updateKeys: Object.keys(update)
      });
      return;
    }

    telegramLogger.info("📋 Datos del mensaje recibido", {
      telegramId: botInstance.id,
      messageId: message.message_id,
      chatId: message.chat.id,
      chatType: message.chat.type,
      fromId: message.from?.id,
      fromUsername: message.from?.username,
      fromFirstName: message.from?.first_name,
      fromLastName: message.from?.last_name,
      fromIsBot: message.from?.is_bot,
      messageText: message.text,
      messageDate: message.date,
      hasPhoto: !!message.photo,
      hasDocument: !!message.document,
      hasVideo: !!message.video,
      hasVoice: !!message.voice
    });

    // Ignorar mensajes del propio bot
    if (message.from?.is_bot) {
      telegramLogger.warn("🤖 Ignorando mensaje del bot", {
        telegramId: botInstance.id,
        fromId: message.from.id,
        messageId: message.message_id
      });
      return;
    }

    // Ignorar grupos si no está permitido
    if (!botInstance.allowGroup && message.chat.type !== "private") {
      telegramLogger.warn("👥 Ignorando mensaje de grupo (no permitido)", {
        telegramId: botInstance.id,
        chatType: message.chat.type,
        chatId: message.chat.id
      });
      return;
    }

    logger.info(`📨 Nuevo mensaje Telegram - Bot: ${botInstance.name}, Chat: ${message.chat.id}`);

    // Crear o actualizar contacto
    telegramLogger.info("👤 Creando/actualizando contacto", {
      telegramId: botInstance.id,
      contactName: getContactName(message),
      contactNumber: String(message.chat.id),
      telegramUserId: String(message.from?.id || message.chat.id),
      isGroup: message.chat.type !== "private",
      companyId: companyId
    });

    const contact = await CreateOrUpdateContactService({
      name: getContactName(message),
      number: `${message.chat.id}_tg${botInstance.id}`, // Crear número único por bot
      email: "",
      isGroup: message.chat.type !== "private",
      companyId: companyId,
      channel: "telegram",
      whatsappId: botInstance.channel === "telegram" ? botInstance.id : undefined,
      telegramUserId: String(message.from?.id || message.chat.id)
    });

    telegramLogger.info("✅ Contacto creado/actualizado exitosamente", {
      telegramId: botInstance.id,
      contactId: contact.id,
      contactName: contact.name,
      contactNumber: contact.number,
      contactChannel: contact.channel
    });

    // Encontrar o crear ticket
    telegramLogger.info("🎫 Creando/buscando ticket", {
      telegramId: botInstance.id,
      contactId: contact.id,
      contactName: contact.name,
      companyId: companyId,
      queueIdToPass: 1,
      queueIdType: typeof 1
    });

    const ticket = await FindOrCreateTicketService(
      contact,
      botInstance,
      0, // unreadMessages
      companyId,
      1, // queueId - Cola por defecto para Telegram
      undefined, // userId
      undefined, // groupContact
      "telegram", // channel
      false, // isImported
      false, // isForward
      { enableLGPD: "disabled" }, // settings con valores por defecto
      false // isTransfered
    );

    telegramLogger.info("✅ Ticket creado/encontrado exitosamente", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketContactId: ticket.contactId,
      ticketWhatsappId: ticket.whatsappId,
      companyId: companyId
    });

    // Procesar contenido del mensaje
    telegramLogger.info("📝 Procesando contenido del mensaje", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      messageId: message.message_id,
      hasText: !!message.text,
      hasPhoto: !!message.photo,
      hasDocument: !!message.document,
      hasVoice: !!message.voice,
      hasVideo: !!message.video
    });

    let messageBody = "";
    let mediaPath: string | undefined;
    let mediaType = "chat";

    if (message.text) {
      messageBody = message.text;
    } else if (message.photo) {
      // Obtener la mejor resolución de la foto
      const photo = message.photo[message.photo.length - 1];
      const file = await telegramAPI.getFile(photo.file_id);
      if (file.file_path) {
        const fileBuffer = await telegramAPI.downloadFile(file.file_path);
        mediaPath = await saveMedia(fileBuffer, "photo.jpg", companyId);
        mediaType = "image";
      }
      messageBody = message.caption || "";
    } else if (message.document) {
      const file = await telegramAPI.getFile(message.document.file_id);
      if (file.file_path) {
        const fileBuffer = await telegramAPI.downloadFile(file.file_path);
        const fileName = message.document.file_name || "document";
        mediaPath = await saveMedia(fileBuffer, fileName, companyId);
        mediaType = "document";
      }
      messageBody = message.caption || message.document.file_name || "Document";
    } else if (message.voice) {
      const file = await telegramAPI.getFile(message.voice.file_id);
      if (file.file_path) {
        const fileBuffer = await telegramAPI.downloadFile(file.file_path);
        mediaPath = await saveMedia(fileBuffer, "voice.ogg", companyId);
        mediaType = "audio";
      }
      messageBody = "🎵 Voice message";
    } else if (message.video) {
      const file = await telegramAPI.getFile(message.video.file_id);
      if (file.file_path) {
        const fileBuffer = await telegramAPI.downloadFile(file.file_path);
        mediaPath = await saveMedia(fileBuffer, "video.mp4", companyId);
        mediaType = "video";
      }
      messageBody = message.caption || "🎥 Video";
    } else if (message.sticker) {
      messageBody = "🌟 Sticker";
      mediaType = "sticker";
    } else if (message.location) {
      messageBody = `📍 Location: ${message.location.latitude}, ${message.location.longitude}`;
      mediaType = "location";
    } else if (message.contact) {
      messageBody = `👤 Contact: ${message.contact.first_name} ${message.contact.phone_number}`;
      mediaType = "contact";
    }

    // Crear mensaje en el sistema
    const messageData = {
      wid: `telegram_${message.message_id}_${Date.now()}`,
      ticketId: ticket.id,
      contactId: contact.id,
      body: messageBody,
      fromMe: false,
      read: false,
      mediaUrl: mediaPath,
      mediaType: mediaType,
      quotedMsgId: message.reply_to_message?.message_id?.toString(),
      ack: 3,
      channel: "telegram"
    };

    telegramLogger.info("💬 Creando mensaje en la base de datos", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      messageBody: messageBody,
      mediaPath: mediaPath,
      mediaType: mediaType,
      fromMe: false,
      messageId: message.message_id
    });

    await CreateMessageService({
      messageData,
      companyId
    });

    telegramLogger.info("✅ Mensaje creado exitosamente", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      messageBody: messageBody
    });

    // Actualizar ticket
    telegramLogger.info("🎫 Actualizando ticket", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      lastMessage: messageBody
    });

    // Recargar ticket para obtener los valores más actuales
    await ticket.reload();

    await UpdateTicketService({
      ticketData: { 
        lastMessage: messageBody,
        unreadMessages: (ticket.unreadMessages || 0) + 1 
      },
      ticketId: ticket.id,
      companyId
    });

    telegramLogger.info("✅ Ticket actualizado exitosamente", {
      telegramId: botInstance.id,
      ticketId: ticket.id
    });

    // Emitir evento para frontend
    telegramLogger.info("📡 Emitiendo evento de socket para frontend", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      companyId: companyId,
      socketRooms: [`${ticket.id}`, `company-${companyId}-mainchannel`]
    });

    const io = getIO();
    io.of(String(companyId))
      .to(String(ticket.id))
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket,
        contact
      });

    // Emitir también al canal principal para la lista de tickets
    io.of(String(companyId))
      .to(`company-${companyId}-mainchannel`)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticketId: ticket.id
      });

    // Procesar mensajes automáticos (bots, etc.)
    await processAutomaticMessages(ticket, message, botInstance, telegramAPI);

    telegramLogger.info("🎉 Procesamiento de mensaje Telegram completado exitosamente", {
      telegramId: botInstance.id,
      ticketId: ticket.id,
      contactId: contact.id,
      messageBody: messageBody,
      companyId: companyId,
      processingTimeMs: Date.now() - Date.now() // Aquí podrías medir tiempo real si necesitas
    });

  } catch (error: any) {
    telegramLogger.error("❌ Error al procesar mensaje de Telegram", error, {
      telegramId: botInstance.id,
      companyId: botInstance.companyId,
      updateId: update.update_id,
      messageId: update.message?.message_id,
      chatId: update.message?.chat?.id,
      errorMessage: error.message,
      errorStack: error.stack
    });
    logger.error({ error: error.message }, "Error en TelegramMessageListener");
  }
};

  // Función auxiliar para obtener nombre del contacto
const getContactName = (message: TelegramMessage): string => {
  if (message.chat.type === "private") {
    const firstName = message.from?.first_name || message.chat.first_name || "";
    const lastName = message.from?.last_name || message.chat.last_name || "";
    return `${firstName} ${lastName}`.trim() || 
           message.from?.username || 
           message.chat.username || 
           `User ${message.from?.id || message.chat.id}`;
  } else {
    return message.chat.title || `Group ${message.chat.id}`;
  }
};

// Función auxiliar para guardar media
const saveMedia = async (
  fileBuffer: Buffer, 
  fileName: string, 
  companyId: number
): Promise<string> => {
  const uploadDir = path.join(
    process.cwd(), 
    "backend", 
    "public", 
    `company${companyId}`, 
    "telegram"
  );

  // Crear directorio si no existe
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const timestamp = Date.now();
  const safeFileName = `${timestamp}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = path.join(uploadDir, safeFileName);

  // Guardar archivo
  fs.writeFileSync(filePath, fileBuffer as any);

  // Retornar URL relativa
  return `/public/company${companyId}/telegram/${safeFileName}`;
};

// Función para procesar mensajes automáticos
const processAutomaticMessages = async (
  ticket: any,
  message: TelegramMessage,
  botInstance: any,
  telegramAPI: TelegramBotAPI
): Promise<void> => {
  try {
    // Mensagem de bienvenida para nuevos contactos
    if (botInstance.greetingMessage && ticket.isFirstMessage) {
      const greetingMessage = formatBody(botInstance.greetingMessage, ticket.contact);

      await telegramAPI.sendMessage({
        chat_id: message.chat.id,
        text: greetingMessage
      });
    }

    // Mensagem fuera del horario
    if (botInstance.outOfHoursMessage) {
      // Verificar horário de atendimento
      // Implementar lógica de horários depois
    }

    // Procesar flujos de chatbot
    // Implementar integración con flowBuilder después

  } catch (error: any) {
    logger.error({ error: error.message }, "Error al procesar mensajes automáticos");
  }
};

export default TelegramMessageListener;
