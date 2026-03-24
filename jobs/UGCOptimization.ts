/**
 * Job: UGCOptimization
 * Procesa ciclo de optimizacion para una campana UGC.
 *
 * Flujo:
 * 1. Recibe companyId + campaignId
 * 2. Llama FeedbackLoopService para ejecutar el ciclo completo
 * 3. Log resultado
 *
 * Si falla: loguea error (no reintenta, se reintenta en el proximo ciclo)
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface UGCOptimizationJobData {
  companyId: number;
  campaignId: number;
}

const handle = async (
  job: Job<UGCOptimizationJobData>
): Promise<{ campaignId: number; learningsCount: number; status: string }> => {
  const { companyId, campaignId } = job.data;

  logger.info(
    `[UGCOptimization] Iniciando ciclo de optimizacion: campaign=${campaignId}, company=${companyId}`
  );

  try {
    // Lazy-load para evitar dependencias circulares
    const FeedbackLoopService = require("../services/UGCOptimizationServices/FeedbackLoopService").default;

    const result = await FeedbackLoopService({
      companyId,
      campaignId
    });

    logger.info(
      `[UGCOptimization] Ciclo completado: campaign=${campaignId}, ` +
      `learnings=${result.learnings.length}, autoApplied=${result.autoApplied}, ` +
      `snapshotId=${result.metricsSnapshot.id}, company=${companyId}`
    );

    return {
      campaignId,
      learningsCount: result.learnings.length,
      status: "completed"
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      `[UGCOptimization] Error en ciclo de optimizacion: campaign=${campaignId}, ` +
      `company=${companyId}, error=${errorMessage}`
    );

    // No relanzar el error para que no reintente innecesariamente
    // El proximo ciclo del scheduler lo intentara de nuevo
    return {
      campaignId,
      learningsCount: 0,
      status: `failed: ${errorMessage}`
    };
  }
};

export default handle;
