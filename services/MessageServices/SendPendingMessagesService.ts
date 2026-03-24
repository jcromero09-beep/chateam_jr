import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";

// Configuración de reintentos
const MAX_SEND_ATTEMPTS = 3;
const SEND_TIMEOUT_MS = 30000; // 30 segundos

interface Request {
  messageId: number;
}

const SendPendingMessagesService = async ({ messageId }: Request): Promise<void> => {
  console.log(`[SendPendingMessages] Iniciando envío para mensaje ID: ${messageId}`);

  // Obtener el mensaje con sus relaciones
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          { model: Contact, attributes: ["id", "name", "number", "email", "profilePicUrl"] },
          { model: Queue, attributes: ["id", "name"] },
          { model: Whatsapp, attributes: ["id", "name"] },
          { model: User, attributes: ["id", "name"] }
        ]
      },
      {
        model: Message,
        as: "quotedMsg"
      }
    ]
  });

  if (!message) {
    console.error(`[SendPendingMessages] Mensaje no encontrado: ${messageId}`);
    throw new Error("Message not found");
  }

  // 1. Verificar si fue marcado para eliminar ANTES de enviar
  if (message.isDeleted || message.messageStatus === "deleted") {
    console.log(`[SendPendingMessages] Mensaje ${messageId} marcado como eliminado, saltando envío`);
    return;
  }

  // 2. Verificar si ya fue enviado exitosamente
  if (message.messageStatus === "sent") {
    console.log(`[SendPendingMessages] Mensaje ${messageId} ya fue enviado anteriormente`);
    return;
  }

  // 3. Verificar límite de reintentos
  if (message.sendAttempts >= MAX_SEND_ATTEMPTS) {
    console.log(`[SendPendingMessages] Mensaje ${messageId} excedió límite de reintentos (${MAX_SEND_ATTEMPTS}), marcamos como failed`);
    await message.update({ messageStatus: "failed" });
    return;
  }

  // 4. Incrementar contador de intentos
  await message.update({ sendAttempts: message.sendAttempts + 1 });

  let sentMessageResult: any = null;

  try {
    // 5. Intentar enviar el mensaje con timeout
    const sendPromise = SendWhatsAppMessage({
      body: message.body,
      ticket: message.ticket,
      quotedMsg: message.quotedMsg || undefined
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout de envío excedido (30s)")), SEND_TIMEOUT_MS);
    });

    sentMessageResult = await Promise.race([sendPromise, timeoutPromise]);

    // 6. Éxito: actualizar status a sent y guardar el wid real
    const wid = sentMessageResult?.key?.id || message.wid;

    await message.update({
      messageStatus: "sent",
      sentAt: new Date(),
      ack: 1, // Marcamos como enviado (recibido por servidor)
      wid: wid
    });

    console.log(`[SendPendingMessages] Mensaje ${messageId} enviado exitosamente, wid: ${wid}`);

    // 7. Emitir evento de actualización por socket
    const io = getIO();
    io.of(String(message.companyId)).emit(`company-${message.companyId}-message-status`, {
      messageId: message.id,
      messageStatus: "sent",
      ack: 1
    });

  } catch (error: any) {
    console.error(`[SendPendingMessages] Error enviando mensaje ${messageId}:`, error.message);

    // 8. Manejar error
    const attempts = message.sendAttempts + 1;

    if (attempts >= MAX_SEND_ATTEMPTS) {
      // Máximo de reintentos alcanzado
      await message.update({
        messageStatus: "failed"
      });

      // Emitir evento de failure
      const io = getIO();
      io.of(String(message.companyId)).emit(`company-${message.companyId}-message-status`, {
        messageId: message.id,
        messageStatus: "failed",
        error: error.message
      });
    }
    // Si no ha alcanzado el límite, el mensaje queda en status "pending" para reintento posterior

    throw error;
  }
};

export default SendPendingMessagesService;
