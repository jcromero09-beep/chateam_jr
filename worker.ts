import 'dotenv/config';
import './bootstrap';
import 'reflect-metadata';
import './database';

process.env.NODE_ID = process.env.NODE_ID || 'worker';
process.env.DISTRIBUTED_MODE = process.env.DISTRIBUTED_MODE || 'true';

import logger from './utils/logger';
import { startQueueProcess, startCampaignScheduler, getAllQueues } from './queues';
import { startFacebookConversionScheduler } from './scheduler/FacebookConversionScheduler';
import { startMetaCoexistenceScheduler } from './scheduler/MetaCoexistenceScheduler';
import { startAppointmentCleanupScheduler } from './scheduler/AppointmentCleanupScheduler';

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
    await startQueueProcess();

    // ✅ NUEVO: Iniciar el scheduler interno de campañas
    logger.info('⏰ Iniciando scheduler interno de campañas...');
    startCampaignScheduler();

    // ✅ NUEVO: Iniciar el scheduler de Facebook Conversions
    logger.info('📤 Iniciando scheduler de Facebook Conversions...');
    startFacebookConversionScheduler();

    // ✅ Iniciar schedulers de Meta Coexistencia (token refresh + liveness)
    logger.info('🔄 Iniciando scheduler de Meta Coexistencia...');
    startMetaCoexistenceScheduler();

    // ✅ Iniciar scheduler de limpieza de citas (1 AM daily)
    logger.info('🧹 Iniciando scheduler de limpieza de citas...');
    startAppointmentCleanupScheduler();

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

// ✅ Manejo graceful de cierre del worker — cierra colas Bull para evitar jobs stuck
async function gracefulShutdown(signal: string) {
  logger.info(`🔄 Worker recibió ${signal} - Cerrando colas Bull gracefully...`);
  try {
    const allQueues = getAllQueues();
    const closePromises = allQueues.map(q => q.close().catch(err => {
      logger.warn(`⚠️ Error cerrando cola: ${err.message}`);
    }));
    await Promise.allSettled(closePromises);
    logger.info(`✅ Worker: ${allQueues.length} colas cerradas correctamente`);
  } catch (err: any) {
    logger.error(`❌ Error en graceful shutdown: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ✅ Iniciar el worker
startWorker();
