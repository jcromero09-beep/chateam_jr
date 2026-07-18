import Bull from "bull";
import { REDIS_URI_CONNECTION } from "../config/redis";
import logger from "../utils/logger";
import CampaignRuleService from "../services/CampaignRuleService";

const LOG_PREFIX = "[CampaignRuleScheduler]";

/**
 * Scheduler que revisa cada 5 minutos las reglas activas
 * y encola las que necesitan ser evaluadas según su frecuencia.
 *
 * Patrón: FacebookConversionScheduler
 */
let isCampaignRuleSchedulerRunning = false;

async function campaignRuleScheduler(): Promise<void> {
  if (isCampaignRuleSchedulerRunning) {
    logger.info(`${LOG_PREFIX} Ya está ejecutándose — saltando iteración`);
    return;
  }

  isCampaignRuleSchedulerRunning = true;

  try {
    // Obtener reglas activas que necesitan evaluarse
    const rulesDue = await CampaignRuleService.getActiveRulesDue();

    if (rulesDue.length === 0) {
      logger.info(`${LOG_PREFIX} 😴 No hay reglas pendientes de evaluación`);
      return;
    }

    logger.info(`${LOG_PREFIX} 📋 ${rulesDue.length} reglas listas para evaluación`);

    // Encolar cada regla en CampaignRuleQueue
    const campaignRuleQueue = new Bull("CampaignRuleQueue", REDIS_URI_CONNECTION);

    for (const rule of rulesDue) {
      try {
        await campaignRuleQueue.add(
          {
            ruleId: rule.id,
            companyId: rule.companyId
          },
          {
            priority: 3,
            attempts: 3,
            backoff: { type: "exponential", delay: 10000 },
            removeOnComplete: { age: 24 * 60 * 60, count: 500 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
          }
        );

        logger.info(`${LOG_PREFIX} ✅ Regla "${rule.name}" (ID: ${rule.id}) encolada para empresa ${rule.companyId}`);
      } catch (enqueueError: any) {
        logger.error(`${LOG_PREFIX} ❌ Error encolando regla ${rule.id}: ${enqueueError.message}`);
      }
    }

    logger.info(`${LOG_PREFIX} 🎉 ${rulesDue.length} reglas encoladas en CampaignRuleQueue`);

  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ Error en scheduler de reglas: ${error.message}`);
  } finally {
    isCampaignRuleSchedulerRunning = false;
  }
}

/**
 * Inicia el scheduler de reglas automatizadas.
 * Se debe llamar desde worker.ts
 */
export function startCampaignRuleScheduler(): void {
  logger.info(`${LOG_PREFIX} 🚀 Iniciando scheduler de reglas automatizadas...`);

  // Ejecutar inmediatamente al iniciar
  campaignRuleScheduler();

  // Revisar cada 5 minutos
  const schedulerInterval = setInterval(() => {
    campaignRuleScheduler();
  }, 5 * 60 * 1000); // 5 minutos

  logger.info(`${LOG_PREFIX} ✅ Scheduler configurado para ejecutar cada 5 minutos`);

  // Cleanup en cierre graceful
  process.on("SIGTERM", () => {
    logger.info(`${LOG_PREFIX} 🔄 Cerrando scheduler...`);
    clearInterval(schedulerInterval);
  });

  process.on("SIGINT", () => {
    logger.info(`${LOG_PREFIX} 🔄 Cerrando scheduler...`);
    clearInterval(schedulerInterval);
  });
}
