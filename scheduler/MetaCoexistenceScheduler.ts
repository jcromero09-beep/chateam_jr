import logger from "../utils/logger";

/**
 * Scheduler para Meta Coexistencia WhatsApp
 *
 * Ejecuta 2 tareas periódicas desde el proceso worker (PM2 id:6):
 * 1. Token Refresh — Renueva tokens Meta >50 días (cada 24h)
 * 2. Liveness Check — Alerta 11/13/14 días sin abrir Business App (cada 6h)
 *
 * Patrón: setInterval + guard de concurrencia (igual que FacebookConversionScheduler)
 */

// ── Guards de concurrencia ──
let isTokenRefreshRunning = false;
let isLivenessRunning = false;

// ── Scheduler 1: Token Refresh (cada 24h) ──
async function metaTokenRefreshScheduler() {
  if (isTokenRefreshRunning) return;
  isTokenRefreshRunning = true;

  try {
    const MetaTokenRefreshService = require("../services/MetaServices/MetaTokenRefreshService").default;
    const result = await MetaTokenRefreshService();

    if (result.tokensRefreshed > 0) {
      logger.info(
        `🔄 [META-TOKEN-REFRESH] ${result.tokensRefreshed} tokens renovados de ${result.tokensChecked} verificados`
      );
    }

    if (result.tokensErrored > 0) {
      logger.warn(
        `⚠️ [META-TOKEN-REFRESH] ${result.tokensErrored} tokens con error de renovación`
      );
    }
  } catch (error: any) {
    logger.error(`❌ [META-TOKEN-REFRESH] Error: ${error.message}`);
  } finally {
    isTokenRefreshRunning = false;
  }
}

// ── Scheduler 2: Liveness Check (cada 6h) ──
async function coexistenceLivenessScheduler() {
  if (isLivenessRunning) return;
  isLivenessRunning = true;

  try {
    const CoexistenceLivenessService = require("../services/MetaServices/CoexistenceLivenessService").default;
    const result = await CoexistenceLivenessService();

    if (result.warnings > 0 || result.criticals > 0 || result.disabled > 0) {
      logger.info(
        `⚠️ [COEX-LIVENESS] ${result.warnings} warnings, ${result.criticals} criticos, ${result.disabled} desactivadas`
      );
    }
  } catch (error: any) {
    logger.error(`❌ [COEX-LIVENESS] Error: ${error.message}`);
  } finally {
    isLivenessRunning = false;
  }
}

/**
 * Inicia los schedulers de Meta Coexistencia
 * Debe llamarse desde worker.ts
 */
export function startMetaCoexistenceScheduler(): void {
  logger.info("🕐 [META-COEX-SCHEDULER] Iniciando schedulers de Meta Coexistencia...");

  // Ejecutar inmediatamente al arrancar
  metaTokenRefreshScheduler();
  coexistenceLivenessScheduler();

  // Token refresh: cada 24 horas
  const tokenInterval = setInterval(() => {
    metaTokenRefreshScheduler();
  }, 24 * 60 * 60 * 1000); // 86.400.000 ms

  // Liveness check: cada 6 horas
  const livenessInterval = setInterval(() => {
    coexistenceLivenessScheduler();
  }, 6 * 60 * 60 * 1000); // 21.600.000 ms

  logger.info("✅ [META-COEX-SCHEDULER] Token refresh (24h) + Liveness (6h) configurados");

  // Cleanup on shutdown
  process.on("SIGTERM", () => {
    logger.info("🔄 [META-COEX-SCHEDULER] Cerrando schedulers...");
    clearInterval(tokenInterval);
    clearInterval(livenessInterval);
  });

  process.on("SIGINT", () => {
    logger.info("🔄 [META-COEX-SCHEDULER] Cerrando schedulers...");
    clearInterval(tokenInterval);
    clearInterval(livenessInterval);
  });
}
