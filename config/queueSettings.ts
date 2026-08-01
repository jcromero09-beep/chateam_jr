/**
 * config/queueSettings.ts — parámetros de las colas Bull.
 *
 * [2026-08-01] Extraído VERBATIM de queues.ts (-199 L). Son datos puros:
 * concurrencia por cola, política de reintentos, limpieza, prioridades, rate limit
 * y detección de trabajos colgados (stall). Ni una línea lee el entorno ni importa
 * nada, así que vivían en medio del fichero que arranca las colas sin motivo.
 *
 * Sacarlos de ahí tiene un efecto concreto: para cambiar la concurrencia de una cola
 * ya no hay que abrir un fichero de 1.600 líneas que además registra los jobs y
 * monta los workers. Y al revés — un cambio de configuración deja de aparecer en el
 * git blame del arranque de colas.
 *
 * Los consume `getQueueSettings()` en queues.ts, que sigue allí porque construye
 * las `Bull.QueueOptions` a partir de estos valores.
 */

// OPTIMIZACIÓN 1: Configuración de Concurrencia
// ========================================
export const QUEUE_CONCURRENCY = {
  CampaignQueue: 2, // Limitado para evitar spam
  ScheduledMessages: 5, // Puede procesar más en paralelo
  ExportContacts: 1, // Operación pesada, solo 1 a la vez
  ImportContacts: 1, // Operación pesada, solo 1 a la vez
  AppointmentReminder: 10, // Ligero, puede procesar muchos
  FacebookConversionQueue: 3, // API de Facebook, limite moderado
  VideoGenerationQueue: 2, // Generación de videos con IA, operación pesada
  UGCVideoGenerationQueue: 2, // fal.ai submit + webhook completion
  UGCVideoPipelineQueue: 1, // UGC AI video workflows can be long-running
  UGCImageGenerationQueue: 2, // UGC image generation through ComfyUI
  GenerationPollQueue: 4, // Polling de jobs de generación (Higgsfield, etc.)
  EmailSendQueue: 10, // Envío individual de emails
  EmailCampaignQueue: 2, // Orquestación de campañas email
  EmailWebhookQueue: 5, // Procesamiento de webhooks email
  EmailAutomationQueue: 5, // Automatizaciones de email
  SendPendingMessage: 5, // Mensajes pendientes, puede procesar varios en paralelo
  CommentResponderQueue: 3, // Respuestas automáticas a comentarios FB/IG (Graph API)
};

// ========================================
// OPTIMIZACIÓN 2: Estrategia de Reintentos
// ========================================
export const QUEUE_RETRY_CONFIG: Record<string, any> = {
  CampaignQueue: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 25s, 125s
  },
  FacebookConversionQueue: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10000 }, // 10s, 50s, 250s, 1250s, 6250s
  },
  AppointmentReminder: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 }, // 1 minuto
  },
  ScheduledMessages: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
  },
  SendPendingMessage: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 25s, 125s
  },
  ImportContacts: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30000 },
  },
  ExportContacts: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30000 },
  },
  VideoGenerationQueue: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 }, // 30s, 150s
  },
  UGCVideoPipelineQueue: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
  },
  UGCVideoGenerationQueue: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
  },
  UGCImageGenerationQueue: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15000 },
  },
  GenerationPollQueue: {
    attempts: 1,
    backoff: { type: "fixed", delay: 10000 },
  },
  EmailSendQueue: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 25s, 125s
  },
  EmailCampaignQueue: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30000 }, // 30s
  },
  EmailWebhookQueue: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 }, // 3s, 15s, 75s
  },
  EmailAutomationQueue: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 25s, 125s
  },
  CommentResponderQueue: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10000 }, // 10s, 50s
  },
};

// ========================================
// OPTIMIZACIÓN 3: Limpieza Automática
// ========================================
export const CLEANUP_CONFIG = {
  completed: {
    age: 1 * 60 * 60, // 1 hora
    count: 100, // Máximo 100
  },
  failed: {
    age: 7 * 24 * 60 * 60, // 7 días
    count: 500, // Máximo 500
  },
};

// ========================================
// OPTIMIZACIÓN 4: Priorización de Colas
// ========================================
export const QUEUE_PRIORITIES: Record<string, number> = {
  AppointmentReminder: 1, // Alta prioridad
  ScheduledMessages: 2, // Alta prioridad
  FacebookConversionQueue: 3, // Prioridad media
  CampaignQueue: 4, // Prioridad media
  ExportContacts: 5, // Baja prioridad
  ImportContacts: 5, // Baja prioridad
  VideoGenerationQueue: 3, // Prioridad media
  UGCVideoPipelineQueue: 3, // Prioridad media
  UGCVideoGenerationQueue: 3, // Prioridad media
  UGCImageGenerationQueue: 3, // Prioridad media
  EmailSendQueue: 2, // Alta prioridad
  EmailCampaignQueue: 3, // Prioridad media
  EmailWebhookQueue: 2, // Alta prioridad
  EmailAutomationQueue: 3, // Prioridad media
};

// ========================================
// OPTIMIZACIÓN 5: Rate Limiting
// ========================================
export const QUEUE_RATE_LIMITER: Record<string, any> = {
  FacebookConversionQueue: {
    max: 100, // Máximo 100 requests
    duration: 60000, // Por minuto
  },
  CampaignQueue: {
    max: 50,
    duration: 60000,
  },
};

// ========================================
// OPTIMIZACIÓN 6: Stalled Jobs Detection & Auto-Recovery
// ========================================
// lockDuration: tiempo máximo que un job puede estar "active" sin renovar el lock
// stalledInterval: cada cuánto Bull revisa si hay jobs stalled (sin heartbeat)
// maxStalledCount: cuántas veces puede re-intentarse un stalled job antes de marcarlo como failed
export const QUEUE_STALL_CONFIG: Record<
  string,
  { lockDuration: number; stalledInterval: number; maxStalledCount: number }
> = {
  CampaignQueue: {
    lockDuration: 5 * 60 * 1000, // 5 min — campañas pueden tardar
    stalledInterval: 2 * 60 * 1000, // Revisar cada 2 min
    maxStalledCount: 2, // 2 reintentos, luego → failed
  },
  VideoGenerationQueue: {
    lockDuration: 10 * 60 * 1000, // 10 min — videos IA tardan mucho
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1,
  },
  UGCVideoPipelineQueue: {
    lockDuration: 30 * 60 * 1000,
    stalledInterval: 5 * 60 * 1000,
    maxStalledCount: 1,
  },
  UGCVideoGenerationQueue: {
    lockDuration: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 2,
  },
  UGCImageGenerationQueue: {
    lockDuration: 15 * 60 * 1000,
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1,
  },
  EmailCampaignQueue: {
    lockDuration: 5 * 60 * 1000,
    stalledInterval: 2 * 60 * 1000,
    maxStalledCount: 2,
  },
  ImportContacts: {
    lockDuration: 10 * 60 * 1000, // 10 min — imports pesados
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1,
  },
  ExportContacts: {
    lockDuration: 10 * 60 * 1000,
    stalledInterval: 3 * 60 * 1000,
    maxStalledCount: 1,
  },
};

// Config por defecto para colas sin config específica
export const DEFAULT_STALL_CONFIG = {
  lockDuration: 3 * 60 * 1000, // 3 min
  stalledInterval: 60 * 1000, // Revisar cada 1 min
  maxStalledCount: 2, // 2 reintentos
};
