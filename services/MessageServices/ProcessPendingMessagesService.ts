import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { Op } from "sequelize";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { getIO } from "../../libs/socket";

// Configuración
const MAX_SEND_ATTEMPTS = 3;
const SEND_TIMEOUT_MS = 30000;

const ProcessPendingMessagesService = async (whatsappId?: number): Promise<number> => {
  console.log(`[ProcessPendingMessages] Iniciando procesamiento de mensajes pendientes`);

  // Buscar mensajes pending o failed que no han sido enviados
  const whereClause: any = {
    messageStatus: { [Op.in]: ['pending', 'failed'] },
    fromMe: true,
    isDeleted: false,
    sendAttempts: { [Op.lt]: MAX_SEND_ATTEMPTS }
  };

  // Si se especifica whatsappId, filtrar por ese número
  if (whatsappId) {
    whereClause.whatsappId = whatsappId;
  }

  const pendingMessages = await Message.findAll({
    where: whereClause,
    order: [['createdAt', 'ASC']],
    limit: 50 // Procesar máximo 50 a la vez
  });

  console.log(`[ProcessPendingMessages] Encontrados ${pendingMessages.length} mensajes para procesar`);

  let processedCount = 0;

  for (const message of pendingMessages) {
    try {
      // Obtener estado actual del mensaje (pudo haber cambiado)
      const currentMessage = await Message.findByPk(message.id);

      if (!currentMessage) continue;

      // Verificar si ya fue enviado o eliminado
      if (currentMessage.messageStatus === 'sent' || currentMessage.isDeleted || currentMessage.messageStatus === 'deleted') {
        console.log(`[ProcessPendingMessages] Mensaje ${message.id} ya enviado o eliminado, saltando`);
        continue;
      }

      // VERIFICACIÓN EXTRA: Si ya tiene ack>=1 o sentAt populated, significa que ya fue enviado
      // Esto evita reenviar mensajes que se enviaron por otros flujos (ej: antes del sistema de cola)
      if (currentMessage.ack >= 1 || currentMessage.sentAt) {
        console.log(`[ProcessPendingMessages] Mensaje ${message.id} ya tiene ack=${currentMessage.ack} o sentAt, actualizando status a sent`);
        await currentMessage.update({ messageStatus: 'sent' });
        continue;
      }

      // Obtener ticket y contacto
      const ticket = await Ticket.findByPk(currentMessage.ticketId);

      if (!ticket) {
        console.error(`[ProcessPendingMessages] Ticket no encontrado para mensaje ${message.id}`);
        await currentMessage.update({ messageStatus: 'failed' });
        continue;
      }

      // Incrementar intentos
      await currentMessage.update({ sendAttempts: currentMessage.sendAttempts + 1 });

      console.log(`[ProcessPendingMessages] Enviando mensaje ID ${message.id}, intento ${currentMessage.sendAttempts + 1}`);

      // Obtener mensaje citado si existe
      let quotedMsg: Message | undefined;
      if (currentMessage.quotedMsgId) {
        quotedMsg = await Message.findByPk(currentMessage.quotedMsgId);
      }

      // Enviar mensaje con timeout
      const sendPromise = SendWhatsAppMessage({
        body: currentMessage.body,
        ticket: ticket,
        quotedMsg
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout de envío excedido (30s)")), SEND_TIMEOUT_MS);
      });

      await Promise.race([sendPromise, timeoutPromise]);

      // Éxito: actualizar status
      await currentMessage.update({
        messageStatus: 'sent',
        sentAt: new Date(),
        ack: 1
      });

      console.log(`[ProcessPendingMessages] Mensaje ${message.id} enviado exitosamente`);

      // Emitir socket para actualizar UI
      const io = getIO();
      io.of(String(currentMessage.companyId)).emit(`company-${currentMessage.companyId}-message-status`, {
        messageId: currentMessage.id,
        messageStatus: 'sent',
        ack: 1
      });

      processedCount++;

    } catch (error: any) {
      console.error(`[ProcessPendingMessages] Error enviando mensaje ${message.id}:`, error.message);

      // Si excedió el límite de intentos, marcar como failed
      const msg = await Message.findByPk(message.id);
      if (msg && msg.sendAttempts >= MAX_SEND_ATTEMPTS) {
        await msg.update({ messageStatus: 'failed' });
        console.log(`[ProcessPendingMessages] Mensaje ${message.id} marcado como failed después de ${MAX_SEND_ATTEMPTS} intentos`);
      }
    }
  }

  console.log(`[ProcessPendingMessages] Procesados ${processedCount} de ${pendingMessages.length} mensajes`);
  return processedCount;
};

export default ProcessPendingMessagesService;
