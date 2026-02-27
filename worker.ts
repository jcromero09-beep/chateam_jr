import 'dotenv/config';
import './bootstrap';
import 'reflect-metadata';
import './database';

import logger from './utils/logger';
import { startQueueProcess, startCampaignScheduler } from './queues';
import { startFacebookConversionScheduler } from './scheduler/FacebookConversionScheduler';

async function startWorker() {
  try {
    logger.info('🚀 Iniciando el proceso del WORKER con scheduler autónomo...');
    logger.info(`🔢 PID del worker: ${process.pid}`);
    logger.info(`🌐 NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`📡 REDIS_URI: ${process.env.REDIS_URI}`);

    // ✅ NO iniciamos conexiones WhatsApp en el worker
    logger.info('⚠️  Worker NO iniciará conexiones WhatsApp - Solo procesará colas');

    // ✅ Iniciar el procesamiento de colas del worker
    logger.info('🔄 Iniciando processamento de filas...');
    startQueueProcess();

    // ✅ NUEVO: Iniciar el scheduler interno de campañas
    logger.info('⏰ Iniciando scheduler interno de campañas...');
    startCampaignScheduler();

    // ✅ NUEVO: Iniciar el scheduler de Facebook Conversions
    logger.info('📤 Iniciando scheduler de Facebook Conversions...');
    startFacebookConversionScheduler();

    logger.info('✅ Worker iniciado correctamente - Procesando campañas con scheduler autónomo');
    logger.info('📋 El worker ahora:');
    logger.info('   • Revisa la BD cada 60 segundos buscando campañas');
    logger.info('   • Procesa campañas EM_ANDAMENTO inmediatamente');
    logger.info('   • Ejecuta campañas PROGRAMADAS cuando llega su hora');
    logger.info('   • No depende de jobs enviados desde el backend principal');

  } catch (error) {
    logger.error('❌ Error al iniciar el worker:');
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

// ✅ Manejo graceful de cierre del worker
process.on('SIGTERM', () => {
  logger.info('🔄 Worker recibió SIGTERM - Cerrando procesos...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🔄 Worker recibió SIGINT - Cerrando procesos...');
  process.exit(0);
});

// ✅ Iniciar el worker
startWorker();