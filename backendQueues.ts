/**
 * Backend Queue Processors
 *
 * Este archivo procesa las colas que el WORKER envía al BACKEND.
 * El backend tiene acceso a Socket.IO y WhatsApp connections,
 * por lo que es el único que puede procesar estas colas.
 */

import Bull from "bull";
import * as Sentry from "@sentry/node";
import { REDIS_URI_CONNECTION } from "./config/redis";
import logger from "./utils/logger";
import Whatsapp from "./models/Whatsapp";
import { SendMessage, MessageData } from "./helpers/SendMessage";
import GetWhatsappWbot from "./helpers/GetWhatsappWbot";
import CreateOrUpdateContactService from "./services/ContactServices/CreateOrUpdateContactService";

// ============================================================
// COLAS QUE EL BACKEND PROCESA
// ============================================================

// Solo crear colas si Redis está configurado
const REDIS_ENABLED = Boolean(REDIS_URI_CONNECTION && REDIS_URI_CONNECTION.trim());

// Cola principal de mensajes - el worker envía aquí para que el backend envíe via WhatsApp
export const messageQueue = REDIS_ENABLED
  ? new Bull("MessageQueue", REDIS_URI_CONNECTION, {
      limiter: {
        max: Number(process.env.REDIS_OPT_LIMITER_MAX) || 1,
        duration: Number(process.env.REDIS_OPT_LIMITER_DURATION) || 3000
      }
    })
  : null as any;

// Cola de mensajes programados
export const sendScheduledMessages = REDIS_ENABLED
  ? new Bull("SendSacheduledMessages", REDIS_URI_CONNECTION)
  : null as any;

// Cola de notificaciones (socket emit)
export const notificationQueue = REDIS_ENABLED
  ? new Bull("NotificationQueue", REDIS_URI_CONNECTION)
  : null as any;

// ============================================================
// HANDLERS
// ============================================================

/**
 * Handler para enviar mensajes via WhatsApp
 */
async function handleSendMessage(job: Bull.Job) {
  try {
    const { data } = job;

    const whatsapp = await Whatsapp.findByPk(data.whatsappId);

    if (whatsapp === null) {
      logger.error(`[BACKEND-QUEUE] WhatsApp no identificado para ID: ${data.whatsappId}`);
      throw Error("WhatsApp no identificado");
    }

    const messageData: MessageData = data.data;

    // Crear/verificar contacto antes de enviar
    try {
      const wbot = await GetWhatsappWbot(whatsapp);
      const number = String(messageData.number).replace(/\D/g, "");
      const remoteJid = `${number}@s.whatsapp.net`;

      await CreateOrUpdateContactService({
        name: number,
        number: number,
        profilePicUrl: "",
        isGroup: false,
        companyId: messageData.companyId || whatsapp.companyId,
        remoteJid: remoteJid,
        whatsappId: whatsapp.id,
        wbot: wbot
      });
    } catch (contactError: any) {
      logger.warn(`[BACKEND-QUEUE] Error creando/verificando contacto: ${contactError.message}`);
    }

    await SendMessage(whatsapp, messageData);
    logger.info(`[BACKEND-QUEUE] Mensaje enviado a ${messageData.number}`);

  } catch (e: any) {
    logger.error(`[BACKEND-QUEUE] Error en handleSendMessage: ${e.message}`);
    Sentry.captureException(e);
    throw e;
  }
}

/**
 * Handler para notificaciones via Socket.IO
 */
async function handleNotification(job: Bull.Job) {
  try {
    const { companyId, event, data } = job.data;

    // Importar getIO dinámicamente para evitar circular dependency
    const { getIO } = await import("./libs/socket");
    const io = getIO();

    if (io) {
      io.of(String(companyId)).emit(event, data);
      logger.info(`[BACKEND-QUEUE] Notificación emitida: ${event} para empresa ${companyId}`);
    } else {
      logger.warn(`[BACKEND-QUEUE] Socket.IO no disponible para emitir notificación`);
    }
  } catch (e: any) {
    logger.error(`[BACKEND-QUEUE] Error en handleNotification: ${e.message}`);
    Sentry.captureException(e);
    throw e;
  }
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

export function startBackendQueueProcessors(): void {
  if (!REDIS_ENABLED) {
    logger.warn("⚠️ [BACKEND] Redis no configurado - las colas están deshabilitadas");
    logger.warn("⚠️ [BACKEND] Configura REDIS_URI en .env para habilitar las colas");
    return;
  }

  logger.info("🔄 [BACKEND] Iniciando procesadores de colas del backend...");

  // Procesar cola de mensajes
  messageQueue.process("SendMessage", handleSendMessage);
  logger.info("✅ [BACKEND] MessageQueue processor iniciado");

  // Procesar cola de notificaciones
  notificationQueue.process("Notification", handleNotification);
  logger.info("✅ [BACKEND] NotificationQueue processor iniciado");

  // Event listeners para monitoreo
  messageQueue.on("failed", (job, err) => {
    logger.error(`❌ [BACKEND] MessageQueue job failed: ${err.message}`);
  });

  messageQueue.on("completed", (job) => {
    logger.info(`✅ [BACKEND] MessageQueue job completed: ${job.id}`);
  });

  notificationQueue.on("failed", (job, err) => {
    logger.error(`❌ [BACKEND] NotificationQueue job failed: ${err.message}`);
  });

  logger.info("✅ [BACKEND] Todos los procesadores de colas iniciados");
}

console.log("📬📬📬 BACKEND-QUEUES.TS FULLY LOADED! 📬📬📬");
