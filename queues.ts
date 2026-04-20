import Bull, { Queue } from "bull";
import { REDIS_URI_CONNECTION } from "./config/redis";
import logger from "./utils/logger";
import moment from "moment";
import { QueryTypes } from "sequelize";

// Check if Redis is configured
const REDIS_ENABLED = Boolean(REDIS_URI_CONNECTION && REDIS_URI_CONNECTION.trim());

// Flag para debug verbose de schedulers (desactivado por defecto en producción)
const DEBUG_SCHEDULER = process.env.LOG_DEBUG_SCHEDULER === 'true';

// Only import lightweight jobs - heavy jobs are lazy-loaded
import ScheduledMessages from "./jobs/ScheduledMessages";
import AppointmentReminder from "./jobs/AppointmentReminder";
import SendPendingMessage from "./jobs/SendPendingMessage";

// Importar modelos necesarios
import CampaignSetting from "./models/CampaignSetting";
import CampaignModel from "./models/Campaign";
import sequelize from "./database";

interface Job {
  name: string;
  queue: Queue;
  handle: any;
}

interface CampaignSettings {
  messageInterval: number;
  longerIntervalAfter: number;
  greaterInterval: number;
  variables: any[];
}

// ========================================
// OPTIMIZACIÓN 1: Configuración de Concurrencia
// ========================================
const QUEUE_CONCURRENCY = {
  CampaignQueue: 2,              // Limitado para evitar spam
  ScheduledMessages: 5,          // Puede procesar más en paralelo
  ExportContacts: 1,             // Operación pesada, solo 1 a la vez
  ImportContacts: 1,             // Operación pesada, solo 1 a la vez
  AppointmentReminder: 10,       // Ligero, puede procesar muchos
  FacebookConversionQueue: 3,    // API de Facebook, limite moderado
  VideoGenerationQueue: 2,       // Generación de videos con IA, operación pesada
  EmailSendQueue: 10,            // Envío individual de emails
  EmailCampaignQueue: 2,         // Orquestación de campañas email
  EmailWebhookQueue: 5,          // Procesamiento de webhooks email
  EmailAutomationQueue: 5,        // Automatizaciones de email
  SendPendingMessage: 5            // Mensajes pendientes, puede procesar varios en paralelo
};

// ========================================
// OPTIMIZACIÓN 2: Estrategia de Reintentos
// ========================================
const QUEUE_RETRY_CONFIG: Record<string, any> = {
  CampaignQueue: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }  // 5s, 25s, 125s
  },
  FacebookConversionQueue: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 }  // 10s, 50s, 250s, 1250s, 6250s
  },
  AppointmentReminder: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 }  // 1 minuto
  },
  ScheduledMessages: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 }
  },
  SendPendingMessage: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }  // 5s, 25s, 125s
  },
  ImportContacts: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 }
  },
  ExportContacts: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 }
  },
  VideoGenerationQueue: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 }  // 30s, 150s
  },
  EmailSendQueue: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }   // 5s, 25s, 125s
  },
  EmailCampaignQueue: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 }        // 30s
  },
  EmailWebhookQueue: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 }   // 3s, 15s, 75s
  },
  EmailAutomationQueue: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }   // 5s, 25s, 125s
  }
};

// ========================================
// OPTIMIZACIÓN 3: Limpieza Automática
// ========================================
const CLEANUP_CONFIG = {
  completed: {
    age: 1 * 60 * 60,     // 1 hora
    count: 100            // Máximo 100
  },
  failed: {
    age: 7 * 24 * 60 * 60,  // 7 días
    count: 500              // Máximo 500
  }
};

// ========================================
// OPTIMIZACIÓN 4: Priorización de Colas
// ========================================
const QUEUE_PRIORITIES: Record<string, number> = {
  AppointmentReminder: 1,        // Alta prioridad
  ScheduledMessages: 2,          // Alta prioridad
  FacebookConversionQueue: 3,    // Prioridad media
  CampaignQueue: 4,              // Prioridad media
  ExportContacts: 5,             // Baja prioridad
  ImportContacts: 5,             // Baja prioridad
  VideoGenerationQueue: 3,       // Prioridad media
  EmailSendQueue: 2,             // Alta prioridad
  EmailCampaignQueue: 3,         // Prioridad media
  EmailWebhookQueue: 2,          // Alta prioridad
  EmailAutomationQueue: 3        // Prioridad media
};

// ========================================
// OPTIMIZACIÓN 5: Rate Limiting
// ========================================
const QUEUE_RATE_LIMITER: Record<string, any> = {
  FacebookConversionQueue: {
    max: 100,        // Máximo 100 requests
    duration: 60000  // Por minuto
  },
  CampaignQueue: {
    max: 50,
    duration: 60000
  }
};

// ========================================
// OPTIMIZACIÓN 6: Stalled Jobs Detection & Auto-Recovery
// ========================================
// lockDuration: tiempo máximo que un job puede estar "active" sin renovar el lock
// stalledInterval: cada cuánto Bull revisa si hay jobs stalled (sin heartbeat)
// maxStalledCount: cuántas veces puede re-intentarse un stalled job antes de marcarlo como failed
const QUEUE_STALL_CONFIG: Record<string, { lockDuration: number; stalledInterval: number; maxStalledCount: number }> = {
  CampaignQueue: {
    lockDuration: 5 * 60 * 1000,      // 5 min — campañas pueden tardar
    stalledInterval: 2 * 60 * 1000,    // Revisar cada 2 min
    maxStalledCount: 2                  // 2 reintentos, luego → failed
  },
  VideoGenerationQueue: {
    lockDuration: 10 * 60 * 1000,      // 10 min — videos IA tardan mucho
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1
  },
  EmailCampaignQueue: {
    lockDuration: 5 * 60 * 1000,
    stalledInterval: 2 * 60 * 1000,
    maxStalledCount: 2
  },
  ImportContacts: {
    lockDuration: 10 * 60 * 1000,      // 10 min — imports pesados
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1
  },
  ExportContacts: {
    lockDuration: 10 * 60 * 1000,
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1
  }
};

// Config por defecto para colas sin config específica
const DEFAULT_STALL_CONFIG = {
  lockDuration: 3 * 60 * 1000,        // 3 min
  stalledInterval: 60 * 1000,          // Revisar cada 1 min
  maxStalledCount: 2                    // 2 reintentos
};

// Helper: obtener settings de Bull para crear una cola con stall detection
function getQueueSettings(name: string): Bull.QueueOptions {
  const stallConfig = QUEUE_STALL_CONFIG[name] || DEFAULT_STALL_CONFIG;
  const rateLimiter = QUEUE_RATE_LIMITER[name];

  return {
    settings: {
      lockDuration: stallConfig.lockDuration,
      stalledInterval: stallConfig.stalledInterval,
      maxStalledCount: stallConfig.maxStalledCount,
      lockRenewTime: Math.floor(stallConfig.lockDuration / 2) // Renovar lock a la mitad
    },
    ...(rateLimiter ? { limiter: rateLimiter } : {})
  };
}

// Define las colas que este proceso (WORKER) va a consumir.
const jobs: Job[] = REDIS_ENABLED ? [
  {
    name: "ScheduledMessages",
    queue: new Bull("ScheduledMessages", REDIS_URI_CONNECTION, getQueueSettings("ScheduledMessages")),
    handle: ScheduledMessages
  },
  {
    name: "AppointmentReminder",
    queue: new Bull("AppointmentReminder", REDIS_URI_CONNECTION, getQueueSettings("AppointmentReminder")),
    handle: AppointmentReminder
  },
  {
    name: "SendPendingMessage",
    queue: new Bull("SendPendingMessage", REDIS_URI_CONNECTION, getQueueSettings("SendPendingMessage")),
    handle: SendPendingMessage
  }
] : [];

// ========================================
// OPTIMIZACIÓN 1 (cont.): Lazy Loading de Colas Pesadas
// ========================================
function loadHeavyQueues() {
  logger.info("🔄 [QUEUES] Cargando colas pesadas con lazy loading...");

  try {
    // Campaign Queue — con stall detection de 5 min
    const Campaign = require("./jobs/Campaign").default;
    jobs.push({
      name: "CampaignQueue",
      queue: new Bull("CampaignQueue", REDIS_URI_CONNECTION, getQueueSettings("CampaignQueue")),
      handle: Campaign
    });
    logger.info("✅ [QUEUES] CampaignQueue cargada (stall: 5min)");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando CampaignQueue: ${error.message}`);
  }

  try {
    // Export Contacts — con stall detection de 10 min
    const ExportContactsToExcel = require("./jobs/ExportContactsToExcel").default;
    jobs.push({
      name: "ExportContacts",
      queue: new Bull("ExportContacts", REDIS_URI_CONNECTION, getQueueSettings("ExportContacts")),
      handle: ExportContactsToExcel
    });
    logger.info("✅ [QUEUES] ExportContacts cargada (stall: 10min)");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando ExportContacts: ${error.message}`);
  }

  try {
    // Import Contacts — con stall detection de 10 min
    const ImportContacts = require("./jobs/ImportContacts").default;
    jobs.push({
      name: "ImportContacts",
      queue: new Bull("ImportContacts", REDIS_URI_CONNECTION, getQueueSettings("ImportContacts")),
      handle: ImportContacts
    });
    logger.info("✅ [QUEUES] ImportContacts cargada (stall: 10min)");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando ImportContacts: ${error.message}`);
  }

  try {
    // Facebook Conversion Queue
    const FacebookConversionQueue = require("./jobs/FacebookConversionQueue").default;
    jobs.push({
      name: "FacebookConversionQueue",
      queue: new Bull("FacebookConversionQueue", REDIS_URI_CONNECTION, getQueueSettings("FacebookConversionQueue")),
      handle: FacebookConversionQueue
    });
    logger.info("✅ [QUEUES] FacebookConversionQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando FacebookConversionQueue: ${error.message}`);
  }

  try {
    // Video Generation Queue — con stall detection de 10 min
    const VideoGeneration = require("./jobs/VideoGeneration").default;
    jobs.push({
      name: "VideoGenerationQueue",
      queue: new Bull("VideoGenerationQueue", REDIS_URI_CONNECTION, getQueueSettings("VideoGenerationQueue")),
      handle: VideoGeneration
    });
    logger.info("✅ [QUEUES] VideoGenerationQueue cargada (stall: 10min)");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando VideoGenerationQueue: ${error.message}`);
  }

  // ========== Email Marketing Queues ==========
  try {
    const EmailSend = require("./jobs/EmailSend").default;
    jobs.push({
      name: "EmailSendQueue",
      queue: new Bull("EmailSendQueue", REDIS_URI_CONNECTION, getQueueSettings("EmailSendQueue")),
      handle: EmailSend
    });
    logger.info("✅ [QUEUES] EmailSendQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando EmailSendQueue: ${error.message}`);
  }

  try {
    const EmailCampaign = require("./jobs/EmailCampaign").default;
    jobs.push({
      name: "EmailCampaignQueue",
      queue: new Bull("EmailCampaignQueue", REDIS_URI_CONNECTION, getQueueSettings("EmailCampaignQueue")),
      handle: EmailCampaign
    });
    logger.info("✅ [QUEUES] EmailCampaignQueue cargada (stall: 5min)");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando EmailCampaignQueue: ${error.message}`);
  }

  try {
    const EmailWebhook = require("./jobs/EmailWebhook").default;
    jobs.push({
      name: "EmailWebhookQueue",
      queue: new Bull("EmailWebhookQueue", REDIS_URI_CONNECTION, getQueueSettings("EmailWebhookQueue")),
      handle: EmailWebhook
    });
    logger.info("✅ [QUEUES] EmailWebhookQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando EmailWebhookQueue: ${error.message}`);
  }

  try {
    const EmailAutomation = require("./jobs/EmailAutomation").default;
    jobs.push({
      name: "EmailAutomationQueue",
      queue: new Bull("EmailAutomationQueue", REDIS_URI_CONNECTION, getQueueSettings("EmailAutomationQueue")),
      handle: EmailAutomation
    });
    logger.info("✅ [QUEUES] EmailAutomationQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando EmailAutomationQueue: ${error.message}`);
  }

  logger.info(`✅ [QUEUES] Total de colas cargadas: ${jobs.length}`);
}

// Conexión a las colas del backend principal (solo si Redis está habilitado)
export const sendMessageQueue = REDIS_ENABLED
  ? new Bull("MessageQueue", REDIS_URI_CONNECTION)
  : null as any;
export const notificationQueue = REDIS_ENABLED
  ? new Bull("NotificationQueue", REDIS_URI_CONNECTION)
  : null as any;
export const sendAppointmentReminderQueue = REDIS_ENABLED
  ? new Bull("SendAppointmentReminder", REDIS_URI_CONNECTION)
  : null as any;

export const queues = jobs.reduce((acc, { name, queue }) => {
  acc[name] = queue;
  return acc;
}, {} as { [key: string]: Queue });

// Exponer jobs para graceful shutdown desde worker.ts
export function getAllQueues(): Queue[] {
  return jobs.map(j => j.queue);
}

// Cola para mensajes programados del backend principal
export const sendScheduledMessagesQueue = REDIS_ENABLED
  ? new Bull("SendScheduledMessages", REDIS_URI_CONNECTION)
  : null as any;

// Cola para mensajes pendientes del backend principal
export const sendPendingMessageQueue = REDIS_ENABLED
  ? new Bull("SendPendingMessage", REDIS_URI_CONNECTION)
  : null as any;

// Cola para mensajes programados del worker
export const scheduledMessagesQueue = REDIS_ENABLED
  ? new Bull("ScheduledMessages", REDIS_URI_CONNECTION)
  : null as any;

// Cola para campañas
export const campaignQueue = REDIS_ENABLED
  ? new Bull("CampaignQueue", REDIS_URI_CONNECTION)
  : null as any;

// Cola para generación de videos con IA
export const videoGenerationQueue = REDIS_ENABLED
  ? new Bull("VideoGenerationQueue", REDIS_URI_CONNECTION)
  : null as any;

// Colas para Email Marketing
export const emailSendQueue = REDIS_ENABLED
  ? new Bull("EmailSendQueue", REDIS_URI_CONNECTION)
  : null as any;
export const emailCampaignQueue = REDIS_ENABLED
  ? new Bull("EmailCampaignQueue", REDIS_URI_CONNECTION)
  : null as any;
export const emailWebhookQueue = REDIS_ENABLED
  ? new Bull("EmailWebhookQueue", REDIS_URI_CONNECTION)
  : null as any;
export const emailAutomationQueue = REDIS_ENABLED
  ? new Bull("EmailAutomationQueue", REDIS_URI_CONNECTION)
  : null as any;

// ─── AI Learning Jobs ────────────────────────────────────────────────────────────
// Cola para inferencia de feedback implícito (delay 5 min tras respuesta IA)
export const feedbackInferenceQueue = REDIS_ENABLED
  ? new Bull("FeedbackInference", REDIS_URI_CONNECTION)
  : null as any;

// Cola para detección de correcciones humanas
export const humanCorrectionQueue = REDIS_ENABLED
  ? new Bull("HumanCorrectionExtractor", REDIS_URI_CONNECTION)
  : null as any;

// Cola para extracción de memorias al cerrar ticket
export const extractMemoryQueue = REDIS_ENABLED
  ? new Bull("ExtractMemory", REDIS_URI_CONNECTION)
  : null as any;

/**
 * Parse time interval to milliseconds
 */
export const parseToMilliseconds = (seconds: number): number => {
  return seconds * 1000;
};

interface ScheduledMessageOccurrenceInput {
  id: number;
  companyId: number;
  sendAt: Date | string;
  contadorEnvio?: number | null;
}

export interface ScheduledMessageOccurrenceJobData {
  id: number;
  companyId: number;
  expectedSendAt: string;
  expectedContadorEnvio: number;
}

interface ScheduledDeliveryMetaInput {
  scheduleId?: number;
  expectedSendAt?: string | Date;
  contadorEnvio?: number | null;
}

function normalizeScheduledMessageOccurrence(
  input: ScheduledMessageOccurrenceInput
): ScheduledMessageOccurrenceJobData {
  return {
    id: input.id,
    companyId: input.companyId,
    expectedSendAt: moment(input.sendAt).toISOString(),
    expectedContadorEnvio: Number(input.contadorEnvio || 0)
  };
}

export function buildScheduledMessageOccurrenceJobId(
  input: ScheduledMessageOccurrenceInput
): string {
  const normalized = normalizeScheduledMessageOccurrence(input);
  const occurrenceTs = moment(normalized.expectedSendAt).valueOf();
  return `schedule:${normalized.id}:occurrence:${occurrenceTs}:${normalized.expectedContadorEnvio}`;
}

function buildScheduledDeliveryJobId(meta?: ScheduledDeliveryMetaInput): string | null {
  if (!meta?.scheduleId) {
    return null;
  }

  const expectedSendAt = meta.expectedSendAt
    ? moment(meta.expectedSendAt).valueOf()
    : "na";
  const contadorEnvio = Number(meta.contadorEnvio || 0);

  return `schedule-delivery:${meta.scheduleId}:${expectedSendAt}:${contadorEnvio}`;
}

export async function enqueueScheduledMessageOccurrence(
  input: ScheduledMessageOccurrenceInput,
  options?: Bull.JobOptions
): Promise<Bull.Job<any>> {
  if (!REDIS_ENABLED || !scheduledMessagesQueue) {
    throw new Error("ScheduledMessages queue is not available");
  }

  const normalized = normalizeScheduledMessageOccurrence(input);
  const computedDelay =
    typeof options?.delay === "number"
      ? Math.max(options.delay, 0)
      : Math.max(moment(normalized.expectedSendAt).diff(moment(), "milliseconds"), 0);

  return scheduledMessagesQueue.add(
    normalized,
    getJobOptions("ScheduledMessages", {
      ...options,
      delay: computedDelay,
      jobId: options?.jobId || buildScheduledMessageOccurrenceJobId(input)
    })
  );
}

/**
 * Generate random value within a range
 */
export const randomValue = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Remove scheduled message jobs from the queue
 */
export async function removeScheduledMessageJobs(scheduleId: number, companyId: number): Promise<void> {
  if (!REDIS_ENABLED || !scheduledMessagesQueue) {
    logger.warn(`[QUEUES] Redis not enabled, cannot remove scheduled message jobs`);
    return;
  }

  try {
    const jobs = await scheduledMessagesQueue.getJobs(['waiting', 'delayed', 'active']);

    for (const job of jobs) {
      if (job.data.id === scheduleId && job.data.companyId === companyId) {
        await job.remove();
        logger.info(`[QUEUES] Removed scheduled message job: scheduleId=${scheduleId}, companyId=${companyId}`);
      }
    }
  } catch (error: any) {
    logger.error(`[QUEUES] Error removing scheduled message jobs: ${error.message}`);
  }
}

// ========================================
// Helper to apply all optimizations to job options
// ========================================
function getJobOptions(name: string, customOptions?: any) {
  const baseOptions: any = {
    // Retry strategy (Optimization 2)
    ...(QUEUE_RETRY_CONFIG[name] || {}),

    // Auto cleanup (Optimization 3)
    removeOnComplete: CLEANUP_CONFIG.completed,
    removeOnFail: CLEANUP_CONFIG.failed,

    // Priority (Optimization 4)
    priority: QUEUE_PRIORITIES[name] || 3
  };

  // Rate limiting (Optimization 5)
  if (QUEUE_RATE_LIMITER[name]) {
    baseOptions.limiter = QUEUE_RATE_LIMITER[name];
  }

  return { ...baseOptions, ...customOptions };
}

export const add = (name: string, data: any, options?: any): Promise<Bull.Job<any>> => {
  // Para envios de mensajes, usar la cola del backend principal
  if (name === "SendMessage") {
    if (DEBUG_SCHEDULER) {
      logger.info(`[WORKER] 📤 SendMessage → MessageQueue | Data: ${JSON.stringify(data)}`);
    }
    return sendMessageQueue.add("SendMessage", data, getJobOptions("SendMessage", options));
  }

  // Para mensajes programados, usar la cola del backend principal
  if (name === "SendScheduledMessages") {
    if (DEBUG_SCHEDULER) {
      logger.info(`[WORKER] 🗓️ SendScheduledMessages → Backend | Data: ${JSON.stringify(data)}`);
    }
    const scheduledDeliveryJobId =
      options?.jobId || buildScheduledDeliveryJobId(data?.meta);

    return sendScheduledMessagesQueue.add(
      "SendMessage",
      data,
      getJobOptions("SendScheduledMessages", {
        ...options,
        ...(scheduledDeliveryJobId ? { jobId: scheduledDeliveryJobId } : {})
      })
    );
  }

  // Para notificaciones, usar la cola del backend principal
  if (name === "Notification") {
    if (DEBUG_SCHEDULER) {
      logger.info(`[WORKER] 🔔 Notification → Backend | Data: ${JSON.stringify(data)}`);
    }
    return notificationQueue.add("Notification", data, getJobOptions("Notification", options));
  }

  // Para recordatorios de citas, usar la cola del backend principal
  if (name === "SendAppointmentReminder") {
    if (DEBUG_SCHEDULER) {
      logger.info(`[WORKER] 📅 SendAppointmentReminder → Backend | Data: ${JSON.stringify(data)}`);
    }
    return sendAppointmentReminderQueue.add("SendMessage", data, options || {
      removeOnComplete: { age: 60 * 60, count: 100 },
      removeOnFail: { age: 60 * 60, count: 50 }
    });
  }

  // Para mensajes pendientes, usar la cola del backend principal
  if (name === "SendPendingMessage") {
    if (DEBUG_SCHEDULER) {
      logger.info(`[add] 📤 SendPendingMessage → Backend Queue | Data: ${JSON.stringify(data)}`);
    }
    return sendPendingMessageQueue.add("SendPendingMessage", data, options || {
      removeOnComplete: { age: 60 * 60, count: 100 },
      removeOnFail: { age: 60 * 60, count: 50 }
    });
  }

  // ── AI Learning Jobs ─────────────────────────────────────────────
  if (name === "FeedbackInference") {
    return feedbackInferenceQueue.add("FeedbackInference", data, {
      removeOnComplete: { age: 60 * 60, count: 500 },
      removeOnFail: { age: 24 * 60 * 60, count: 100 }
    });
  }

  if (name === "HumanCorrectionExtractor") {
    return humanCorrectionQueue.add("HumanCorrectionExtractor", data, {
      removeOnComplete: { age: 60 * 60, count: 500 },
      removeOnFail: { age: 24 * 60 * 60, count: 100 }
    });
  }

  if (name === "ExtractMemory") {
    return extractMemoryQueue.add("ExtractMemory", data, {
      removeOnComplete: { age: 60 * 60, count: 500 },
      removeOnFail: { age: 24 * 60 * 60, count: 100 }
    });
  }

  // Para otros jobs, usar colas locales del worker
  if (!queues[name]) {
    logger.error(`[WORKER] ❌ Queue ${name} not found`);
    throw new Error(`Queue ${name} not found`);
  }

  if (DEBUG_SCHEDULER) {
    logger.info(`[WORKER] 📤 Job → cola local: ${name}`);
  }
  return queues[name].add(data, options || { removeOnComplete: true, removeOnFail: true });
};

// Función para obtener configuraciones de campaña específicas de la empresa
export async function getSettings(companyId: number): Promise<CampaignSettings> {
  try {
    const settings = await CampaignSetting.findAll({
      where: { companyId },
      attributes: ["key", "value"]
    });

    let messageInterval: number = 20;
    let longerIntervalAfter: number = 20;
    let greaterInterval: number = 60;
    let variables: any[] = [];

    settings.forEach(setting => {
      if (setting.key === "messageInterval") {
        try {
          messageInterval = JSON.parse(setting.value);
        } catch (parseError) {
          logger.warn(`[WORKER] Error parsing messageInterval for company ${companyId}: ${setting.value}`);
        }
      }
      if (setting.key === "longerIntervalAfter") {
        try {
          longerIntervalAfter = JSON.parse(setting.value);
        } catch (parseError) {
          logger.warn(`[WORKER] Error parsing longerIntervalAfter for company ${companyId}: ${setting.value}`);
        }
      }
      if (setting.key === "greaterInterval") {
        try {
          greaterInterval = JSON.parse(setting.value);
        } catch (parseError) {
          logger.warn(`[WORKER] Error parsing greaterInterval for company ${companyId}: ${setting.value}`);
        }
      }
      if (setting.key === "variables") {
        try {
          variables = JSON.parse(setting.value);
        } catch (parseError) {
          logger.warn(`[WORKER] Error parsing variables for company ${companyId}: ${setting.value}`);
          variables = [];
        }
      }
    });

    logger.info(`⚙️ [WORKER] Configuraciones empresa ${companyId}: messageInterval=${messageInterval}s, longerIntervalAfter=${longerIntervalAfter}, greaterInterval=${greaterInterval}s`);

    return {
      messageInterval,
      longerIntervalAfter,
      greaterInterval,
      variables
    };

  } catch (error: any) {
    logger.error(`❌ [WORKER] Error obteniendo configuraciones empresa ${companyId}: ${error?.message || error}`);
    throw error;
  }
}

// Scheduler interno para verificar campañas
let isSchedulerRunning = false;

// Set para trackear campañas ya encoladas y evitar duplicados
const enqueuedCampaignIds = new Set<number>();

// Limpiar campaña del set cuando el job termina (completado o fallido)
function trackCampaignCompletion(campaignId: number) {
  // Se limpiará cuando el campaignScheduler detecte que ya no está EM_ANDAMENTO
  setTimeout(() => {
    enqueuedCampaignIds.delete(campaignId);
  }, 10 * 60 * 1000); // Limpiar después de 10 minutos max (seguridad)
}

async function campaignScheduler() {
  if (isSchedulerRunning) {
    console.log('🔄 [WORKER-SCHEDULER] Ya está ejecutándose, saltando...');
    return;
  }

  isSchedulerRunning = true;

  try {
    const now = moment();
    console.log(`🕐 [WORKER-SCHEDULER] === INICIANDO REVISION ${now.format('DD/MM/YYYY HH:mm:ss')} ===`);

    // Buscar campañas EM_ANDAMENTO (inmediatas) que no han sido procesadas
    console.log(`🔍 [WORKER-SCHEDULER] Buscando campañas EM_ANDAMENTO...`);
    const immediateCampaigns: { id: number; companyId: number; name: string; }[] =
      await sequelize.query(
        `SELECT id, "companyId", name FROM "Campaigns" 
         WHERE status = 'EM_ANDAMENTO'`,
        { type: QueryTypes.SELECT }
      );

    console.log(`📊 [WORKER-SCHEDULER] Campañas EM_ANDAMENTO encontradas: ${immediateCampaigns.length}`);
    if (immediateCampaigns.length > 0) {
      console.log(`📋 [WORKER-SCHEDULER] Campañas inmediatas:`);
      immediateCampaigns.forEach(campaign => {
        console.log(`   - ID: ${campaign.id}, Empresa: ${campaign.companyId}, Nombre: "${campaign.name}"`);
      });
    }

    // Buscar campañas PROGRAMADAS que llegó su hora
    console.log(`🔍 [WORKER-SCHEDULER] Buscando campañas PROGRAMADAS...`);
    const scheduledCampaigns: { id: number; companyId: number; name: string; scheduledAt: string; }[] =
      await sequelize.query(
        `SELECT id, "companyId", name, "scheduledAt" FROM "Campaigns" 
         WHERE status = 'PROGRAMADA' 
         AND "scheduledAt" BETWEEN NOW() - INTERVAL '2 minutes' AND NOW() + INTERVAL '5 minutes'`,
        { type: QueryTypes.SELECT }
      );

    console.log(`📊 [WORKER-SCHEDULER] Campañas PROGRAMADAS encontradas: ${scheduledCampaigns.length}`);
    if (scheduledCampaigns.length > 0) {
      console.log(`📋 [WORKER-SCHEDULER] Campañas programadas:`);
      scheduledCampaigns.forEach(campaign => {
        const scheduledTime = moment(campaign.scheduledAt).format('DD/MM/YYYY HH:mm:ss');
        console.log(`   - ID: ${campaign.id}, Empresa: ${campaign.companyId}, Nombre: "${campaign.name}", Programada: ${scheduledTime}`);
      });
    }

    // Debug verbose — solo si LOG_DEBUG_SCHEDULER=true en .env
    if (DEBUG_SCHEDULER) {
      const allCampaigns = await sequelize.query(
        `SELECT id, "companyId", name, status, "scheduledAt", "createdAt" FROM "Campaigns" ORDER BY "createdAt" DESC LIMIT 10`,
        { type: QueryTypes.SELECT }
      );
      console.log(`🔍 [WORKER-SCHEDULER] DEBUG - Últimas 10 campañas en BD: ${allCampaigns.length}`);
      allCampaigns.forEach((campaign: any) => {
        const scheduledTime = campaign.scheduledAt ? moment(campaign.scheduledAt).format('DD/MM/YYYY HH:mm:ss') : 'No programada';
        const createdTime = moment(campaign.createdAt).format('DD/MM/YYYY HH:mm:ss');
        console.log(`   - ID: ${campaign.id}, Status: ${campaign.status}, Programada: ${scheduledTime}, Creada: ${createdTime}`);
      });
    }

    // Procesar campañas inmediatas (con protección anti-duplicado)
    if (immediateCampaigns.length > 0) {
      console.log(`🚀 [WORKER-SCHEDULER] Procesando ${immediateCampaigns.length} campañas inmediatas...`);

      for (const campaign of immediateCampaigns) {
        try {
          // Verificar si ya fue encolada para evitar duplicados
          if (enqueuedCampaignIds.has(campaign.id)) {
            console.log(`⏭️ [WORKER-SCHEDULER] Campaña ID=${campaign.id} ya encolada, saltando...`);
            continue;
          }

          console.log(`📋 [WORKER-SCHEDULER] Procesando campaña inmediata: ID=${campaign.id}`);

          await add("CampaignQueue", {
            id: campaign.id,
            companyId: campaign.companyId,
            type: "immediate",
            schedulerTimestamp: now.toISOString()
          });

          // Marcar como encolada
          enqueuedCampaignIds.add(campaign.id);
          trackCampaignCompletion(campaign.id);

          console.log(`✅ [WORKER-SCHEDULER] Campaña inmediata ID=${campaign.id} enviada a la cola`);
        } catch (error) {
          console.error(`❌ [WORKER-SCHEDULER] Error procesando campaña inmediata ID=${campaign.id}: ${error.message}`);
        }
      }
    }

    // Procesar campañas programadas
    if (scheduledCampaigns.length > 0) {
      console.log(`⏰ [WORKER-SCHEDULER] Procesando ${scheduledCampaigns.length} campañas programadas...`);

      for (const campaign of scheduledCampaigns) {
        try {
          // Verificar si ya fue encolada para evitar duplicados
          if (enqueuedCampaignIds.has(campaign.id)) {
            console.log(`⏭️ [WORKER-SCHEDULER] Campaña programada ID=${campaign.id} ya encolada, saltando...`);
            continue;
          }

          const scheduledTime = moment(campaign.scheduledAt);
          const scheduledTimeStr = scheduledTime.format('DD/MM HH:mm:ss');
          const delay = scheduledTime.diff(now, "milliseconds");

          console.log(`📅 [WORKER-SCHEDULER] Procesando campaña programada: ID=${campaign.id}, Hora: ${scheduledTimeStr}`);

          // Cambiar status a EM_ANDAMENTO
          await sequelize.query(
            `UPDATE "Campaigns" SET status = 'EM_ANDAMENTO' WHERE id = :campaignId`,
            {
              replacements: { campaignId: campaign.id },
              type: QueryTypes.UPDATE
            }
          );

          console.log(`🔄 [WORKER-SCHEDULER] Status cambiado a EM_ANDAMENTO para campaña ID=${campaign.id}`);

          // Calcular delay hasta el momento exacto
          const finalDelay = delay > 0 ? delay : 0;

          console.log(`⏱️ [WORKER-SCHEDULER] Delay calculado: ${finalDelay}ms (${Math.round(finalDelay / 60000)}min)`);

          // Agregar a la cola CON DELAY hasta el momento exacto
          await add("CampaignQueue", {
            id: campaign.id,
            companyId: campaign.companyId,
            type: "scheduled",
            originalScheduledAt: campaign.scheduledAt,
            schedulerTimestamp: now.toISOString()
          }, {
            delay: finalDelay,
            priority: 2,
            removeOnComplete: { age: 60 * 60, count: 10 },
            removeOnFail: { age: 60 * 60, count: 10 }
          });

          // Marcar como encolada
          enqueuedCampaignIds.add(campaign.id);
          trackCampaignCompletion(campaign.id);

          console.log(`✅ [WORKER-SCHEDULER] Campaña programada ID=${campaign.id} enviada a cola con delay de ${Math.round(finalDelay / 60000)}min`);
        } catch (error) {
          console.error(`❌ [WORKER-SCHEDULER] Error procesando campaña programada ID=${campaign.id}: ${error.message}`);
        }
      }
    }

    if (immediateCampaigns.length === 0 && scheduledCampaigns.length === 0) {
      console.log('😴 [WORKER-SCHEDULER] No hay campañas pendientes de procesar');
    }

    console.log(`🕐 [WORKER-SCHEDULER] === REVISION COMPLETADA ${now.format('HH:mm:ss')} ===`);

  } catch (error) {
    console.error(`❌ [WORKER-SCHEDULER] Error en scheduler: ${error.message}`);
    console.error(`❌ [WORKER-SCHEDULER] Stack trace:`, error.stack);
  } finally {
    isSchedulerRunning = false;
  }
}

// Función para iniciar el scheduler
export function startCampaignScheduler(): void {
  logger.info('🕐 [WORKER-SCHEDULER] Iniciando scheduler interno de campañas...');

  // Ejecutar inmediatamente al iniciar
  campaignScheduler();

  // Ejecutar cada 2 minutos (en lugar de 60 segundos)
  const schedulerInterval = setInterval(() => {
    campaignScheduler();
  }, 2 * 60 * 1000); // 2 minutos

  logger.info('✅ [WORKER-SCHEDULER] Scheduler configurado para ejecutar cada 2 minutos');

  // Cleanup en caso de cierre
  process.on('SIGTERM', () => {
    logger.info('🔄 [WORKER-SCHEDULER] Cerrando scheduler...');
    clearInterval(schedulerInterval);
  });

  process.on('SIGINT', () => {
    logger.info('🔄 [WORKER-SCHEDULER] Cerrando scheduler...');
    clearInterval(schedulerInterval);
  });
}

// Función para verificar horarios permitidos
const checkerWeek = async (companyId: number) => {
  const sab = moment().day() === 6;
  const dom = moment().day() === 0;

  const sabado = await CampaignSetting.findOne({
    where: { key: "sabado", companyId }
  });

  const domingo = await CampaignSetting.findOne({
    where: { key: "domingo", companyId }
  });

  if (sabado?.value === "false" && sab) {
    return true; // Pausar
  }

  if (domingo?.value === "false" && dom) {
    return true; // Pausar
  }

  return false;
};

const checkTime = async (companyId: number) => {
  const startHour = await CampaignSetting.findOne({
    where: {
      key: "startHour",
      companyId
    }
  });

  const endHour = await CampaignSetting.findOne({
    where: {
      key: "endHour",
      companyId
    }
  });

  if (!startHour || !endHour) {
    logger.warn(`[WORKER] Horarios no configurados para empresa ${companyId}`);
    return true; // Permitir si no hay configuración
  }

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;
  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    return true;
  }

  logger.info(
    `[WORKER] Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow} não está dentro do horário`
  );

  return false;
};

// Scheduler para mensajes programados
let isScheduledMessagesRunning = false;

// Set para trackear ocurrencias ya encoladas y evitar mensajes duplicados
const enqueuedScheduleOccurrences = new Set<string>();

async function scheduledMessagesScheduler() {
  if (isScheduledMessagesRunning) {
    console.log('🔄 [SCHEDULED-SCHEDULER] Ya está ejecutándose, saltando...');
    return;
  }

  isScheduledMessagesRunning = true;

  try {
    const now = moment();
    console.log(`🕐 [SCHEDULED-SCHEDULER] === INICIANDO REVISION ${now.format('DD/MM/YYYY HH:mm:ss')} ===`);

    // Buscar mensajes programados que llegó su hora EXACTA (sin margen futuro)
    console.log(`🔍 [SCHEDULED-SCHEDULER] Buscando mensajes programados...`);

    const scheduledQuery = `SELECT s.id, s."companyId", s."sendAt", s."contactId", s."contadorEnvio", s."enviarQuantasVezes", s.status, s."sentAt", c.name as "contactName"
         FROM "Schedules" s
         LEFT JOIN "Contacts" c ON s."contactId" = c.id
         WHERE s."sentAt" IS NULL
         AND s."sendAt" <= NOW() + INTERVAL '1 minute'
         AND s."sendAt" >= NOW() - INTERVAL '2 minutes'
         AND (s.status IS NULL OR s.status = 'PENDENTE')
         AND (s."contadorEnvio" IS NULL OR s."contadorEnvio" < s."enviarQuantasVezes")`;

    if (DEBUG_SCHEDULER) {
      console.log(`🔍 [SCHEDULED-SCHEDULER] Query: ${scheduledQuery}`);
    }

    const scheduledMessages: { id: number; companyId: number; sendAt: string; contactId: number; contadorEnvio: number; enviarQuantasVezes: number; status: string; sentAt: string; }[] =
      await sequelize.query(scheduledQuery, { type: QueryTypes.SELECT });

    // Debug verbose — solo si LOG_DEBUG_SCHEDULER=true en .env
    if (DEBUG_SCHEDULER) {
      const allSchedules = await sequelize.query(
        `SELECT s.id, s."sendAt", s."contadorEnvio", s."enviarQuantasVezes", s.status, s."sentAt", c.name
         FROM "Schedules" s
         LEFT JOIN "Contacts" c ON s."contactId" = c.id
         ORDER BY s."sendAt" DESC LIMIT 5`,
        { type: QueryTypes.SELECT }
      );
      console.log(`🔍 [SCHEDULED-SCHEDULER] DEBUG - Últimos 5 Schedules en BD:`);
      allSchedules.forEach((sch: any) => {
        const sendTime = sch.sendAt ? moment(sch.sendAt).format('DD/MM/YYYY HH:mm:ss') : 'null';
        const sentTime = sch.sentAt ? moment(sch.sentAt).format('DD/MM/YYYY HH:mm:ss') : 'null';
        console.log(`   - ID: ${sch.id}, sendAt: ${sendTime}, sentAt: ${sentTime}, status: ${sch.status}, contador: ${sch.contadorEnvio}/${sch.enviarQuantasVezes}, contacto: ${sch.name}`);
      });
    }

    console.log(`📊 [SCHEDULED-SCHEDULER] Mensajes programados encontrados: ${scheduledMessages.length}`);
    if (scheduledMessages.length > 0) {
      console.log(`📋 [SCHEDULED-SCHEDULER] Mensajes programados:`);
      scheduledMessages.forEach((schedule: any) => {
        const sendTime = moment(schedule.sendAt).format('DD/MM/YYYY HH:mm:ss');
        console.log(`   - ID: ${schedule.id}, Empresa: ${schedule.companyId}, Contacto: "${schedule.contactName}", Programado: ${sendTime}`);
      });
    }

    // Procesar mensajes programados
    if (scheduledMessages.length > 0) {
      console.log(`⏰ [SCHEDULED-SCHEDULER] Procesando ${scheduledMessages.length} mensajes programados...`);

      for (const schedule of scheduledMessages) {
        try {
          const occurrenceJobId = buildScheduledMessageOccurrenceJobId({
            id: schedule.id,
            companyId: schedule.companyId,
            sendAt: schedule.sendAt,
            contadorEnvio: schedule.contadorEnvio || 0
          });

          // Verificar si ya fue encolada esta ocurrencia para evitar mensajes duplicados
          if (enqueuedScheduleOccurrences.has(occurrenceJobId)) {
            if (DEBUG_SCHEDULER) {
              console.log(`⏭️ [SCHEDULED-SCHEDULER] Ocurrencia ${occurrenceJobId} ya encolada, saltando...`);
            }
            continue;
          }

          const sendTime = moment(schedule.sendAt);
          const sendTimeStr = sendTime.format('DD/MM HH:mm:ss');
          const delay = sendTime.diff(now, "milliseconds");

          console.log(`📅 [SCHEDULED-SCHEDULER] Procesando mensaje programado: ID=${schedule.id}, Hora: ${sendTimeStr}`);

          // Calcular delay hasta el momento exacto
          const finalDelay = delay > 0 ? delay : 0;

          if (DEBUG_SCHEDULER) {
            console.log(`⏱️ [SCHEDULED-SCHEDULER] Delay calculado: ${finalDelay}ms (${Math.round(finalDelay / 60000)}min)`);
          }

          // Agregar a la cola CON DELAY hasta el momento exacto
          await enqueueScheduledMessageOccurrence({
            id: schedule.id,
            companyId: schedule.companyId,
            sendAt: schedule.sendAt,
            contadorEnvio: schedule.contadorEnvio || 0
          }, {
            delay: finalDelay,
            priority: 1,
            removeOnComplete: { age: 60 * 60, count: 100 },
            removeOnFail: { age: 60 * 60, count: 50 }
          });

          // Marcar como encolado (limpiar después de 5 minutos)
          enqueuedScheduleOccurrences.add(occurrenceJobId);
          setTimeout(() => enqueuedScheduleOccurrences.delete(occurrenceJobId), 5 * 60 * 1000);

          console.log(`✅ [SCHEDULED-SCHEDULER] Mensaje programado ID=${schedule.id} enviado a cola (${occurrenceJobId})`);
        } catch (error) {
          console.error(`❌ [SCHEDULED-SCHEDULER] Error procesando mensaje programado ID=${schedule.id}: ${error.message}`);
        }
      }
    }

    if (scheduledMessages.length === 0) {
      console.log('😴 [SCHEDULED-SCHEDULER] No hay mensajes programados pendientes');
    }

    console.log(`🕐 [SCHEDULED-SCHEDULER] === REVISION COMPLETADA ${now.format('HH:mm:ss')} ===`);

  } catch (error) {
    console.error(`❌ [SCHEDULED-SCHEDULER] Error en scheduler: ${error.message}`);
    console.error(`❌ [SCHEDULED-SCHEDULER] Stack trace:`, error.stack);
  } finally {
    isScheduledMessagesRunning = false;
  }
}

// Función para iniciar el scheduler de mensajes programados
export function startScheduledMessagesScheduler(): void {
  logger.info('🕐 [SCHEDULED-SCHEDULER] Iniciando scheduler de mensajes programados...');

  // Ejecutar inmediatamente al iniciar
  scheduledMessagesScheduler();

  // Ejecutar cada 1 minuto
  const schedulerInterval = setInterval(() => {
    scheduledMessagesScheduler();
  }, 1 * 60 * 1000); // 1 minuto

  logger.info('✅ [SCHEDULED-SCHEDULER] Scheduler configurado para ejecutar cada 1 minuto');

  // Cleanup en caso de cierre
  process.on('SIGTERM', () => {
    logger.info('🔄 [SCHEDULED-SCHEDULER] Cerrando scheduler...');
    clearInterval(schedulerInterval);
  });

  process.on('SIGINT', () => {
    logger.info('🔄 [SCHEDULED-SCHEDULER] Cerrando scheduler...');
    clearInterval(schedulerInterval);
  });
}

export function startQueueProcess(): void {
  logger.info("🔄 Iniciando processamento de filas do WORKER...");
  logger.info(`📊 Total de filas a processar: ${jobs.length}`);

  // Load heavy queues only in worker process
  loadHeavyQueues();

  // ── AI Learning Jobs: processors específicos ──────────────────────────
  // FeedbackInferenceJob — concurrencia 5, sin stall detection custom
  if (REDIS_ENABLED && feedbackInferenceQueue) {
    const FeedbackInference = require("./jobs/FeedbackInferenceJob").default;
    feedbackInferenceQueue.process(5, async (bullJob: Bull.Job) => {
      await FeedbackInference(bullJob);
    });
    feedbackInferenceQueue.on("failed", (failedJob, err) => {
      logger.error(`❌ FeedbackInference failed: ${JSON.stringify(failedJob.data)} | ${err.message}`);
    });
    feedbackInferenceQueue.on("completed", (completedJob) => {
      if (DEBUG_SCHEDULER) {
        logger.info(`✅ FeedbackInference completed: ${JSON.stringify(completedJob.data)}`);
      }
    });
    logger.info("✅ [QUEUES] FeedbackInferenceQueue configurada (concurrency=5)");
  }

  // HumanCorrectionExtractorJob — concurrencia 5
  if (REDIS_ENABLED && humanCorrectionQueue) {
    const HumanCorrectionExtractor = require("./jobs/HumanCorrectionExtractorJob").default;
    humanCorrectionQueue.process(5, async (bullJob: Bull.Job) => {
      await HumanCorrectionExtractor(bullJob);
    });
    humanCorrectionQueue.on("failed", (failedJob, err) => {
      logger.error(`❌ HumanCorrectionExtractor failed: ${JSON.stringify(failedJob.data)} | ${err.message}`);
    });
    humanCorrectionQueue.on("completed", (completedJob) => {
      if (DEBUG_SCHEDULER) {
        logger.info(`✅ HumanCorrectionExtractor completed: ${JSON.stringify(completedJob.data)}`);
      }
    });
    logger.info("✅ [QUEUES] HumanCorrectionExtractorQueue configurada (concurrency=5)");
  }

  // ExtractMemoryJob — concurrencia 2 (llama LLM)
  if (REDIS_ENABLED && extractMemoryQueue) {
    const ExtractMemory = require("./jobs/ExtractMemoryJob").default;
    extractMemoryQueue.process(2, async (bullJob: Bull.Job) => {
      await ExtractMemory(bullJob);
    });
    extractMemoryQueue.on("failed", (failedJob, err) => {
      logger.error(`❌ ExtractMemory failed: ${JSON.stringify(failedJob.data)} | ${err.message}`);
    });
    extractMemoryQueue.on("completed", (completedJob) => {
      if (DEBUG_SCHEDULER) {
        logger.info(`✅ ExtractMemory completed: ${JSON.stringify(completedJob.data)}`);
      }
    });
    logger.info("✅ [QUEUES] ExtractMemoryQueue configurada (concurrency=2)");
  }

  jobs.forEach((job, index) => {
    logger.info(`⚙️ Configurando fila ${index + 1}/${jobs.length}: ${job.name}`);

    // Get concurrency for this queue (Optimization 1)
    const concurrency = QUEUE_CONCURRENCY[job.name] || 1;
    logger.info(`🔧 [${job.name}] Concurrency: ${concurrency}`);

    if (job.name === "CampaignQueue") {
      // Processor específico para "ProcessCampaign"
      job.queue.process("ProcessCampaign", concurrency, async (bullJob: Bull.Job) => {
        const { id, companyId, type, schedulerTimestamp } = bullJob.data;

        logger.info(`📥 [WORKER] Procesando campaña ID=${id} para empresa=${companyId} (type: ${type || 'legacy'})`);

        if (!companyId) {
          logger.error(`❌ [WORKER] CompanyId es undefined para campaña ID=${id}. Job data: ${JSON.stringify(bullJob.data)}`);
          throw new Error(`CompanyId es undefined para campaña ID=${id}`);
        }

        try {
          // Verificar horarios permitidos
          const isTimeAllowed = await checkTime(companyId);
          const isWeekAllowed = !(await checkerWeek(companyId));

          if (!isTimeAllowed || !isWeekAllowed) {
            logger.info(`📵 [WORKER] Fora do horário permitido para campaña ID=${id}, empresa=${companyId}. TimeAllowed: ${isTimeAllowed}, WeekAllowed: ${isWeekAllowed}.`);
            logger.info(`⏰ [WORKER] Reagendando campaña para dentro de 5 minutos...`);

            const error = new Error("Fora do horário permitido - reagendando em 5 minutos");
            (error as any).delay = 5 * 60 * 1000;
            throw error;
          }

          // Procesar la campaña usando el handler lazy-loaded
          await job.handle(bullJob);
          logger.info(`✅ [WORKER] ProcessCampaign ID=${id} procesado con sucesso`);

        } catch (error) {
          logger.error(`❌ [WORKER] ProcessCampaign ID=${id} falhou: ${error.message}`);

          if (error.message.includes("Fora do horário permitido")) {
            logger.info(`🔄 [WORKER] Error de horario - Bull reintentar automáticamente`);
          }

          throw error;
        }
      });

      // Processor para "SendCampaign" sin timestamp check
      job.queue.process("SendCampaign", concurrency, async (bullJob: Bull.Job) => {
        const { id, companyId } = bullJob.data;

        logger.info(`� [WORKER] SendCampaign ID=${id} para empresa=${companyId}`);

        if (!companyId) {
          logger.error(`❌ [WORKER] CompanyId es undefined para campaña ID=${id}. Job data: ${JSON.stringify(bullJob.data)}`);
          throw new Error(`CompanyId es undefined para campaña ID=${id}`);
        }

        try {
          await job.handle(bullJob);
        } catch (error) {
          logger.error(`❌ [WORKER] Error SendCampaign ID=${id}: ${error.message}`);
          throw error;
        }
      });

    } else {
      // Para otras colas, proceso genérico con concurrencia optimizada
      job.queue.process(concurrency, async (bullJob: Bull.Job) => {
        try {
          logger.info(`📨 Recebendo job na fila ${job.name}: ${JSON.stringify(bullJob.data)}`);
          await job.handle(bullJob);
          logger.info(`✅ Job na fila ${job.name} processado com sucesso`);
        } catch (error) {
          logger.error(`❌ Job ${job.name} falhou: ${error.message}`);
          throw error;
        }
      });
    }

    job.queue.on("failed", (failedJob, err) => {
      logger.error(`❌ Job failed: ${job.queue.name} ${JSON.stringify(failedJob.data)} | Error: ${err.message}`);
      // Limpiar del set de encolados si es campaña o schedule
      if (job.name === "CampaignQueue" && failedJob.data?.id) {
        enqueuedCampaignIds.delete(failedJob.data.id);
      }
    });

    job.queue.on("completed", (completedJob) => {
      logger.info(`✅ Job completed: ${job.queue.name} ${JSON.stringify(completedJob.data)}`);
      // Limpiar del set de encolados si es campaña o schedule
      if (job.name === "CampaignQueue" && completedJob.data?.id) {
        enqueuedCampaignIds.delete(completedJob.data.id);
      }
    });

    job.queue.on("active", (activeJob) => {
      if (DEBUG_SCHEDULER) {
        logger.info(`🔄 Job active: ${job.queue.name} ${JSON.stringify(activeJob.data)}`);
      }
    });

    // 🚨 STALLED JOB DETECTION — detecta jobs que se colgaron sin responder
    job.queue.on("stalled", (stalledJob) => {
      logger.warn(`🚨 [STALLED] Job STALLED en ${job.queue.name}: ID=${stalledJob} — Bull intentará re-procesarlo automáticamente`);
    });
  });

  logger.info("✅ Todas as filas foram configuradas com sucesso");

  // ========================================
  // OPTIMIZACIÓN 7: Limpieza Automática Periódica de Jobs Stuck
  // ========================================
  startQueueCleanupScheduler();

  // Iniciar scheduler de mensajes programados
  startScheduledMessagesScheduler();
}

// ========================================
// OPTIMIZACIÓN 7: Limpieza Automática de Jobs Stuck
// ========================================

/**
 * cleanStuckJobs — Limpia jobs atrapados en TODAS las colas del worker.
 *
 * Acciones:
 * 1. Limpia jobs "completed" con más de 1 hora
 * 2. Limpia jobs "failed" con más de 24 horas
 * 3. Detecta y mueve jobs "active" que llevan más de `maxActiveMinutes` sin terminar
 *
 * Se puede llamar manualmente o se ejecuta automáticamente cada 15 minutos.
 */
export async function cleanStuckJobs(maxActiveMinutes: number = 15): Promise<{
  cleaned: { completed: number; failed: number; stuckActive: number };
  errors: string[];
}> {
  const result = { cleaned: { completed: 0, failed: 0, stuckActive: 0 }, errors: [] as string[] };

  for (const job of jobs) {
    try {
      // 1. Limpiar jobs completados (> 1 hora)
      const cleanedCompleted = await job.queue.clean(60 * 60 * 1000, 'completed');
      result.cleaned.completed += cleanedCompleted.length;

      // 2. Limpiar jobs fallidos (> 24 horas)
      const cleanedFailed = await job.queue.clean(24 * 60 * 60 * 1000, 'failed');
      result.cleaned.failed += cleanedFailed.length;

      // 3. Detectar jobs "active" que están atrapados (sin heartbeat)
      const activeJobs = await job.queue.getActive();
      const now = Date.now();
      const maxActiveMs = maxActiveMinutes * 60 * 1000;

      for (const activeJob of activeJobs) {
        const jobAge = now - (activeJob.processedOn || activeJob.timestamp);

        if (jobAge > maxActiveMs) {
          logger.warn(`🧹 [CLEANUP] Job STUCK detectado en ${job.name}: jobId=${activeJob.id}, age=${Math.round(jobAge / 60000)}min, data=${JSON.stringify(activeJob.data)}`);

          try {
            // Mover a failed con mensaje descriptivo (no eliminar — BD SAGRADA)
            await activeJob.moveToFailed(
              { message: `Job stuck por ${Math.round(jobAge / 60000)} minutos — movido a failed automáticamente` },
              true // ignoreLock: true — forzar aunque tenga lock
            );
            result.cleaned.stuckActive++;

            logger.warn(`🧹 [CLEANUP] Job stuck ID=${activeJob.id} en ${job.name} movido a FAILED correctamente`);

            // Si es campaña, limpiar del set de tracking
            if (job.name === "CampaignQueue" && activeJob.data?.id) {
              enqueuedCampaignIds.delete(activeJob.data.id);
            }
          } catch (moveError: any) {
            logger.error(`❌ [CLEANUP] Error moviendo job stuck ID=${activeJob.id}: ${moveError.message}`);
            result.errors.push(`${job.name}:${activeJob.id}: ${moveError.message}`);
          }
        }
      }
    } catch (error: any) {
      logger.error(`❌ [CLEANUP] Error limpiando cola ${job.name}: ${error.message}`);
      result.errors.push(`${job.name}: ${error.message}`);
    }
  }

  return result;
}

/**
 * Scheduler automático de limpieza — cada 15 minutos
 */
function startQueueCleanupScheduler(): void {
  logger.info('🧹 [CLEANUP] Iniciando scheduler de limpieza automática de colas...');

  // Ejecutar limpieza inicial al arrancar (esperar 30s para que todo esté listo)
  setTimeout(async () => {
    logger.info('🧹 [CLEANUP] Ejecutando limpieza inicial post-arranque...');
    const result = await cleanStuckJobs(10); // Jobs stuck > 10 min en el arranque
    logger.info(`🧹 [CLEANUP] Limpieza inicial: completed=${result.cleaned.completed}, failed=${result.cleaned.failed}, stuck=${result.cleaned.stuckActive}`);
  }, 30 * 1000);

  // Ejecutar cada 15 minutos
  const cleanupInterval = setInterval(async () => {
    try {
      const result = await cleanStuckJobs(15); // Jobs stuck > 15 min
      const total = result.cleaned.completed + result.cleaned.failed + result.cleaned.stuckActive;

      if (total > 0) {
        logger.info(`🧹 [CLEANUP] Limpieza periódica: completed=${result.cleaned.completed}, failed=${result.cleaned.failed}, stuck=${result.cleaned.stuckActive}`);
      }

      if (result.errors.length > 0) {
        logger.warn(`⚠️ [CLEANUP] Errores: ${result.errors.join(' | ')}`);
      }
    } catch (error: any) {
      logger.error(`❌ [CLEANUP] Error en scheduler de limpieza: ${error.message}`);
    }
  }, 15 * 60 * 1000); // 15 minutos

  // Cleanup del interval en cierre
  process.on('SIGTERM', () => clearInterval(cleanupInterval));
  process.on('SIGINT', () => clearInterval(cleanupInterval));

  logger.info('✅ [CLEANUP] Limpieza automática configurada: cada 15 min, stuck > 15 min → failed');
}

/**
 * getQueueHealth — Retorna estado de salud de todas las colas (para endpoints de monitoreo)
 */
export async function getQueueHealth(): Promise<Array<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  stalled: number;
}>> {
  const health = [];

  for (const job of jobs) {
    try {
      const counts = await job.queue.getJobCounts();
      health.push({
        name: job.name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        stalled: 0 // Bull no expone count de stalled directamente
      });
    } catch (error: any) {
      health.push({
        name: job.name,
        waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1, stalled: -1
      });
    }
  }

  return health;
}
