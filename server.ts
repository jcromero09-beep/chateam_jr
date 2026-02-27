import 'dotenv/config';
import './bootstrap';
import 'reflect-metadata';
import './database';

import logger from './utils/logger';
import { startQueueProcess } from './queues';

async function startWorker() {
  try {
    logger.info('🚀 Iniciando o BACKEND WORKER...');

    // O worker apenas inicia o processamento das filas que lhe competem.
    // A lógica de quais filas iniciar está no arquivo queues.ts
    await startQueueProcess();

    logger.info('✅ Processamento de colas do worker iniciado');
    logger.info('🎉 Worker iniciado corretamente - Processando tarefas pesadas');
  } catch (error: any) {
    logger.error({ error: error?.message }, '❌ Error al iniciar o worker');
    process.exit(1);
  }
}

process.on('uncaughtException', err => {
  console.error(`${new Date().toUTCString()} uncaughtException:`, err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  console.error(
    `${new Date().toUTCString()} unhandledRejection:`,
    reason,
    p
  );
});

// ✅ Manejo graceful de cierre del servidor principal
process.on('SIGTERM', () => {
  logger.info('🔄 Worker recebeu SIGTERM - Cerrando procesos...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🔄 Worker recebeu SIGINT - Cerrando procesos...');
  process.exit(0);
});

startWorker();