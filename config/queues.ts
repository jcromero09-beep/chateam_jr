// src-worker/config/queues.ts
export const QUEUES_CONFIG = {
    // Colas que el WORKER debe procesar (trabajos pesados)
    WORKER_QUEUES: [
      "Campaign",
      "ScheduledMessages",
      "ExportContacts"
    ],
    
    // Colas que el WORKER puede añadir trabajos pero NO procesa
    // (estas son procesadas por el backend principal)
    BACKEND_QUEUES: [
      "SendMessage",
      "MessageQueue"
    ]
  };