import Bull, { Queue } from "bull";
import { REDIS_URI_CONNECTION } from "./config/redis";
import logger from "./utils/logger";
import moment from "moment";
import { QueryTypes } from "sequelize";

// Check if Redis is configured
const REDIS_ENABLED = Boolean(REDIS_URI_CONNECTION && REDIS_URI_CONNECTION.trim());

// Only import lightweight jobs - heavy jobs are lazy-loaded
import ScheduledMessages from "./jobs/ScheduledMessages";
import AppointmentReminder from "./jobs/AppointmentReminder";

// Importar modelos necesarios
import CampaignSetting from "./models/CampaignSetting";
import CampaignModel from "./models/Campaign";
import sequelize from "./database";

interface Job {
  name: string;
  queue: Queue;
  handle: (job: Bull.Job) => Promise<void>;
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
  VideoGenerationQueue: 2        // Generación de videos con IA, operación pesada
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
  VideoGenerationQueue: 3        // Prioridad media
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

// Define las colas que este proceso (WORKER) va a consumir.
const jobs: Job[] = REDIS_ENABLED ? [
  {
    name: "ScheduledMessages",
    queue: new Bull("ScheduledMessages", REDIS_URI_CONNECTION),
    handle: ScheduledMessages
  },
  {
    name: "AppointmentReminder",
    queue: new Bull("AppointmentReminder", REDIS_URI_CONNECTION),
    handle: AppointmentReminder
  }
] : [];

// ========================================
// OPTIMIZACIÓN 1 (cont.): Lazy Loading de Colas Pesadas
// ========================================
function loadHeavyQueues() {
  logger.info("🔄 [QUEUES] Cargando colas pesadas con lazy loading...");

  try {
    // Campaign Queue
    const Campaign = require("./jobs/Campaign").default;
    jobs.push({
      name: "CampaignQueue",
      queue: new Bull("CampaignQueue", REDIS_URI_CONNECTION),
      handle: Campaign
    });
    logger.info("✅ [QUEUES] CampaignQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando CampaignQueue: ${error.message}`);
  }

  try {
    // Export Contacts
    const ExportContactsToExcel = require("./jobs/ExportContactsToExcel").default;
    jobs.push({
      name: "ExportContacts",
      queue: new Bull("ExportContacts", REDIS_URI_CONNECTION),
      handle: ExportContactsToExcel
    });
    logger.info("✅ [QUEUES] ExportContacts cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando ExportContacts: ${error.message}`);
  }

  try {
    // Import Contacts
    const ImportContacts = require("./jobs/ImportContacts").default;
    jobs.push({
      name: "ImportContacts",
      queue: new Bull("ImportContacts", REDIS_URI_CONNECTION),
      handle: ImportContacts
    });
    logger.info("✅ [QUEUES] ImportContacts cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando ImportContacts: ${error.message}`);
  }

  try {
    // Facebook Conversion Queue
    const FacebookConversionQueue = require("./jobs/FacebookConversionQueue").default;
    jobs.push({
      name: "FacebookConversionQueue",
      queue: new Bull("FacebookConversionQueue", REDIS_URI_CONNECTION),
      handle: FacebookConversionQueue
    });
    logger.info("✅ [QUEUES] FacebookConversionQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando FacebookConversionQueue: ${error.message}`);
  }

  try {
    // Video Generation Queue
    const VideoGeneration = require("./jobs/VideoGeneration").default;
    jobs.push({
      name: "VideoGenerationQueue",
      queue: new Bull("VideoGenerationQueue", REDIS_URI_CONNECTION),
      handle: VideoGeneration
    });
    logger.info("✅ [QUEUES] VideoGenerationQueue cargada");
  } catch (error: any) {
    logger.error(`❌ [QUEUES] Error cargando VideoGenerationQueue: ${error.message}`);
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

// Cola para mensajes programados del backend principal
export const sendScheduledMessagesQueue = REDIS_ENABLED
  ? new Bull("SendScheduledMessages", REDIS_URI_CONNECTION)
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

/**
 * Parse time interval to milliseconds
 */
export const parseToMilliseconds = (seconds: number): number => {
  return seconds * 1000;
};

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
    logger.info(`[WORKER] 🔍 DEBUG - Enviando job SendMessage:`);
    logger.info(`[WORKER] 📤 Queue: MessageQueue`);
    logger.info(`[WORKER] 📋 Data: ${JSON.stringify(data)}`);
    logger.info(`[WORKER] ⚙️ Options: ${JSON.stringify(options)}`);

    return sendMessageQueue.add("SendMessage", data, getJobOptions("SendMessage", options));
  }

  // Para mensajes programados, usar la cola del backend principal
  if (name === "SendScheduledMessages") {
    logger.info(`[WORKER] 🗓️ Enviando mensaje programado al backend principal:`);
    logger.info(`[WORKER] 📋 Data: ${JSON.stringify(data)}`);

    return sendScheduledMessagesQueue.add("SendMessage", data, getJobOptions("SendScheduledMessages", options));
  }

  // Para notificaciones, usar la cola del backend principal
  if (name === "Notification") {
    logger.info(`[WORKER] 🔔 Enviando notificación al backend principal`);
    logger.info(`[WORKER] 📋 Data: ${JSON.stringify(data)}`);

    return notificationQueue.add("Notification", data, getJobOptions("Notification", options));
  }

  // Para recordatorios de citas, usar la cola del backend principal
  if (name === "SendAppointmentReminder") {
    logger.info(`[WORKER] 📅 Enviando recordatorio de cita al backend principal`);
    logger.info(`[WORKER] 📋 Data: ${JSON.stringify(data)}`);

    return sendAppointmentReminderQueue.add("SendMessage", data, options || {
      removeOnComplete: { age: 60 * 60, count: 100 },
      removeOnFail: { age: 60 * 60, count: 50 }
    });
  }

  // Para otros jobs, usar colas locales del worker
  if (!queues[name]) {
    logger.error(`[WORKER] ❌ Queue ${name} not found`);
    throw new Error(`Queue ${name} not found`);
  }

  logger.info(`[WORKER] 📤 Enviando job a cola local: ${name}`);
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

    // También mostrar todas las campañas para debug
    console.log(`🔍 [WORKER-SCHEDULER] DEBUG - Mostrando TODAS las campañas en BD:`);
    const allCampaigns = await sequelize.query(
      `SELECT id, "companyId", name, status, "scheduledAt", "createdAt" FROM "Campaigns" ORDER BY "createdAt" DESC LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    console.log(`📊 [WORKER-SCHEDULER] Total campañas en BD (últimas 10): ${allCampaigns.length}`);
    allCampaigns.forEach((campaign: any) => {
      const scheduledTime = campaign.scheduledAt ? moment(campaign.scheduledAt).format('DD/MM/YYYY HH:mm:ss') : 'No programada';
      const createdTime = moment(campaign.createdAt).format('DD/MM/YYYY HH:mm:ss');
      console.log(`   - ID: ${campaign.id}, Status: ${campaign.status}, Programada: ${scheduledTime}, Creada: ${createdTime}`);
    });

    // Procesar campañas inmediatas
    if (immediateCampaigns.length > 0) {
      console.log(`🚀 [WORKER-SCHEDULER] Procesando ${immediateCampaigns.length} campañas inmediatas...`);

      for (const campaign of immediateCampaigns) {
        try {
          console.log(`📋 [WORKER-SCHEDULER] Procesando campaña inmediata: ID=${campaign.id}`);

          await add("CampaignQueue", {
            id: campaign.id,
            companyId: campaign.companyId,
            type: "immediate",
            schedulerTimestamp: now.toISOString()
          });

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

    // Primero mostrar la query para debug
    const debugQuery = `SELECT s.id, s."companyId", s."sendAt", s."contactId", s."contadorEnvio", s."enviarQuantasVezes", s.status, s."sentAt", c.name as "contactName"
         FROM "Schedules" s
         LEFT JOIN "Contacts" c ON s."contactId" = c.id
         WHERE s."sentAt" IS NULL
         AND s."sendAt" <= NOW() + INTERVAL '1 minute'
         AND s."sendAt" >= NOW() - INTERVAL '2 minutes'
         AND (s.status IS NULL OR s.status = 'PENDENTE')
         AND (s."contadorEnvio" IS NULL OR s."contadorEnvio" < s."enviarQuantasVezes")`;

    console.log(`🔍 [SCHEDULED-SCHEDULER] Query: ${debugQuery}`);

    const scheduledMessages: { id: number; companyId: number; sendAt: string; contactId: number; contadorEnvio: number; enviarQuantasVezes: number; status: string; sentAt: string; }[] =
      await sequelize.query(debugQuery, { type: QueryTypes.SELECT });

    // También buscar TODOS los mensajes para debug
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
          const sendTime = moment(schedule.sendAt);
          const sendTimeStr = sendTime.format('DD/MM HH:mm:ss');
          const delay = sendTime.diff(now, "milliseconds");

          console.log(`📅 [SCHEDULED-SCHEDULER] Procesando mensaje programado: ID=${schedule.id}, Hora: ${sendTimeStr}`);

          // Calcular delay hasta el momento exacto
          const finalDelay = delay > 0 ? delay : 0;

          console.log(`⏱️ [SCHEDULED-SCHEDULER] Delay calculado: ${finalDelay}ms (${Math.round(finalDelay / 60000)}min)`);

          // Agregar a la cola CON DELAY hasta el momento exacto
          await add("ScheduledMessages", {
            id: schedule.id,
            companyId: schedule.companyId
          }, {
            delay: finalDelay,
            priority: 1,
            removeOnComplete: { age: 60 * 60, count: 100 },
            removeOnFail: { age: 60 * 60, count: 50 }
          });

          console.log(`✅ [SCHEDULED-SCHEDULER] Mensaje programado ID=${schedule.id} enviado a cola con delay de ${Math.round(finalDelay / 60000)}min`);
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
    });

    job.queue.on("completed", (completedJob) => {
      logger.info(`✅ Job completed: ${job.queue.name} ${JSON.stringify(completedJob.data)}`);
    });

    job.queue.on("active", (activeJob) => {
      logger.info(`🔄 Job active: ${job.queue.name} ${JSON.stringify(activeJob.data)}`);
    });
  });

  logger.info("✅ Todas as filas foram configuradas com sucesso");

  // Iniciar scheduler de mensajes programados
  startScheduledMessagesScheduler();
}