import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { Op } from "sequelize";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import { getIO } from "../../libs/socket";

// Configuración
const MAX_SEND_ATTEMPTS = 3;
const SEND_TIMEOUT_MS = 30000;

/**
 * Verifica si una conexión WhatsApp está activa y lista para enviar mensajes
 * Versión que soporta modo distribuido: busca en registry Redis si no está local
 */
const isWhatsAppConnectionActive = async (whatsappId: number): Promise<boolean> => {
  try {
    const whatsapp = await Whatsapp.findByPk(whatsappId);
    if (!whatsapp) {
      console.log(`[ProcessPendingMessages] WhatsApp ID ${whatsappId} no encontrado en BD`);
      return false;
    }

    // Verificar estado en BD (más confiable que llamadas HTTP)
    const validStatuses = ['connected', 'CONNECTED', 'open', 'OPEN'];
    if (!validStatuses.includes(whatsapp.status)) {
      console.log(`[ProcessPendingMessages] WhatsApp ID ${whatsappId} tiene status "${whatsapp.status}" en BD`);
      return false;
    }

    // MODO DISTRIBUIDO: Usar GetWhatsappWbot que soporta routing entre nodos
    const isDistributed = process.env.DISTRIBUTED_MODE === "true";
    if (isDistributed) {
      try {
        const wbot = await GetWhatsappWbot(whatsapp);
        // Si es proxy remoto, también está "activo" (la sesión existe en otro nodo)
        if (wbot && (wbot._isRemoteProxy || wbot.ws)) {
          return true;
        }
      } catch (wbotErr) {
        // GetWhatsappWbot puede lanzar error si no encuentra la sesión en ningún nodo
        console.log(`[ProcessPendingMessages] Sesión no disponible en ningún nodo: ${wbotErr.message}`);
        return false;
      }
    }

    // MODO LOCAL: Verificar sesión local en memoria (fallback para modo no distribuido)
    try {
      const { getWbot } = await import("../../libs/wbot");
      const wbot = getWbot(whatsappId);
      // Verificar si el ws está conectado (readyState 1 = OPEN)
      const ws = wbot?.ws as any;
      if (wbot && ws && (ws.readyState === 1 || ws.readyState === undefined)) {
        return true;
      }
    } catch (wbotError) {
      // getWbot lanza error si no está inicializado
      console.log(`[ProcessPendingMessages] Sesión no está en memoria local: ${wbotError.message}`);
      return false;
    }

    return false;
  } catch (error: any) {
    console.log(`[ProcessPendingMessages] Error verificando WhatsApp ID ${whatsappId}: ${error.message}`);
    return false;
  }
};

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

      // NUEVA VERIFICACIÓN: Verificar si la conexión WhatsApp está activa
      // Esto evita intentos innecesarios cuando la conexión está desconectada
      const whatsappId = ticket.whatsappId || currentMessage.whatsappId;
      if (whatsappId) {
        const isActive = await isWhatsAppConnectionActive(whatsappId);
        if (!isActive) {
          console.log(`[ProcessPendingMessages] WhatsApp ID ${whatsappId} no está activo, saltando mensaje ${message.id}`);
          // No marcar como failed ni incrementar intentos - dejar como pending para reintentar cuando conecte
          continue;
        }
      }

      // Incrementar intentos
      await currentMessage.update({ sendAttempts: currentMessage.sendAttempts + 1 });

      console.log(`[ProcessPendingMessages] Enviando mensaje ID ${message.id}, intento ${currentMessage.sendAttempts + 1}`);

      // Obtener mensaje citado si existe
      let quotedMsg: Message | undefined;
      if (currentMessage.quotedMsgId) {
        quotedMsg = await Message.findByPk(currentMessage.quotedMsgId);
      }

      // Verificar que el ticket tiene whatsappId
      if (!ticket.whatsappId) {
        console.error(`[ProcessPendingMessages] Ticket ${ticket.id} no tiene whatsappId`);
        await currentMessage.update({ messageStatus: 'failed' });
        continue;
      }

      // Obtener WhatsApp para usar GetWhatsappWbot
      const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
      if (!whatsapp) {
        console.error(`[ProcessPendingMessages] WhatsApp ${ticket.whatsappId} no encontrado`);
        await currentMessage.update({ messageStatus: 'failed' });
        continue;
      }

      // Obtener wbot via GetWhatsappWbot (soporta routing entre nodos)
      let wbot: any;
      try {
        wbot = await GetWhatsappWbot(whatsapp);
        console.log(`[ProcessPendingMessages] Obtenido wbot para WhatsApp ${ticket.whatsappId}, es proxy remoto: ${wbot._isRemoteProxy}`);
      } catch (wbotErr: any) {
        console.error(`[ProcessPendingMessages] Error obteniendo wbot: ${wbotErr.message}`);
        await currentMessage.update({ messageStatus: 'failed' });
        continue;
      }

      // Enviar mensaje con timeout - pasar wbot directamente para evitar nueva llamada a getWbot
      const sendPromise = SendWhatsAppMessage({
        body: currentMessage.body,
        ticket: ticket,
        quotedMsg,
        wbot // Pasar el wbot ya obtenido
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout de envío excedido (30s)")), SEND_TIMEOUT_MS);
      });

      const sentMessageResult: any = await Promise.race([sendPromise, timeoutPromise]);
      const wid = sentMessageResult?.key?.id || currentMessage.wid;
      const remoteJid =
        sentMessageResult?.key?.remoteJid ||
        currentMessage.remoteJid ||
        (ticket as any)?.contact?.remoteJid ||
        null;

      // Éxito: actualizar status
      await currentMessage.update({
        messageStatus: 'sent',
        sentAt: new Date(),
        ack: 1,
        wid,
        remoteJid,
        dataJson: JSON.stringify(sentMessageResult)
      });

      console.log(
        `[OutboundDeliveryTrace] accepted source=ProcessPendingMessages messageId=${currentMessage.id} ticketId=${ticket.id} whatsappId=${ticket.whatsappId} wid=${wid} remoteJid=${remoteJid}`
      );
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
