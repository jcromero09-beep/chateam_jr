import Message from "../../models/Message";
import { Op } from "sequelize";
import queue from "../../libs/queue";

// Configuración
const MAX_SEND_ATTEMPTS = 3;

interface Request {
  whatsappId: number;
}

const RetryPendingMessagesService = async ({ whatsappId }: Request): Promise<number> => {
  console.log(`[RetryPendingMessages] Buscando mensajes pendientes para WhatsApp ID: ${whatsappId}`);

  // Buscar mensajes pending o failed para este whatsapp que no han sido eliminados
  const pendingMessages = await Message.findAll({
    where: {
      whatsappId: whatsappId,
      messageStatus: {
        [Op.in]: ["pending", "failed"]
      },
      isDeleted: false,
      sendAttempts: {
        [Op.lt]: MAX_SEND_ATTEMPTS
      },
      fromMe: true // Solo mensajes salientes
    },
    order: [["createdAt", "ASC"]], // Enviar en orden FIFO
    limit: 50 // Limitar a 50 mensajes por reconexión para no saturar
  });

  console.log(`[RetryPendingMessages] Encontrados ${pendingMessages.length} mensajes para reenviar`);

  let enqueuedCount = 0;

  for (const message of pendingMessages) {
    // Obtener estado actual del mensaje (pudo haber cambiado mientras procesamos)
    const currentMessage = await Message.findByPk(message.id);

    if (!currentMessage) continue;

    // Verificar si fue marcado para eliminar
    if (currentMessage.isDeleted || currentMessage.messageStatus === "deleted") {
      console.log(`[RetryPendingMessages] Mensaje ${message.id} marcado como eliminado, saltando`);
      continue;
    }

    // Verificar si ya fue enviado
    if (currentMessage.messageStatus === "sent") {
      console.log(`[RetryPendingMessages] Mensaje ${message.id} ya fue enviado`);
      continue;
    }

    // Verificar límite de intentos
    if (currentMessage.sendAttempts >= MAX_SEND_ATTEMPTS) {
      console.log(`[RetryPendingMessages] Mensaje ${message.id} excedió límite de intentos`);
      continue;
    }

    // Encolar para reenvío
    try {
      await queue.add("SendPendingMessage", { messageId: message.id });
      enqueuedCount++;
    } catch (error) {
      console.error(`[RetryPendingMessages] Error encolando mensaje ${message.id}:`, error);
    }
  }

  console.log(`[RetryPendingMessages] Encolados ${enqueuedCount} mensajes para reenvío`);
  return enqueuedCount;
};

export default RetryPendingMessagesService;
