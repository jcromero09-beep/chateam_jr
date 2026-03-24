/**
 * Service: OptimizationSchedulerService
 * Ejecutar cada 4 horas para campanas activas.
 * Se invoca desde el worker o via CronJob externo.
 * Busca campanas activas con optimizacion habilitada y las encola.
 */

import { Op } from "sequelize";
import UGCCampaign from "../../models/UGCCampaign";
import { add } from "../../queues";
import logger from "../../utils/logger";

const OptimizationSchedulerService = async (): Promise<void> => {
  try {
    // Buscar campanas activas con optimizacion habilitada
    const campaigns = await UGCCampaign.findAll({
      where: {
        status: { [Op.in]: ["active", "optimizing"] }
      },
      attributes: ["id", "companyId", "name", "nextOptimizationAt", "optimizationConfig"]
    });

    // Filtrar campanas que necesitan optimizacion
    const now = new Date();
    const campaignsToOptimize = campaigns.filter(campaign => {
      // Si tiene nextOptimizationAt y aun no ha llegado, saltar
      if (campaign.nextOptimizationAt && new Date(campaign.nextOptimizationAt) > now) {
        return false;
      }

      // Verificar si optimizacion esta habilitada en config
      const config = campaign.optimizationConfig as Record<string, unknown> || {};
      return config.enabled !== false; // Por defecto habilitada
    });

    if (campaignsToOptimize.length === 0) {
      logger.info("[OptimizationScheduler] No hay campanas pendientes de optimizacion");
      return;
    }

    for (const campaign of campaignsToOptimize) {
      try {
        await add("UGCOptimizationQueue", {
          companyId: campaign.companyId,
          campaignId: campaign.id
        });

        logger.info(
          `[OptimizationScheduler] Campana encolada: id=${campaign.id}, ` +
          `name=${campaign.name}, company=${campaign.companyId}`
        );
      } catch (queueError: unknown) {
        const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
        logger.warn(
          `[OptimizationScheduler] Error encolando campana ${campaign.id}: ${queueMsg}`
        );
      }
    }

    logger.info(
      `[OptimizationScheduler] Encoladas ${campaignsToOptimize.length} campanas para optimizacion`
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[OptimizationScheduler] Error en scheduler: ${errorMessage}`);
  }
};

export default OptimizationSchedulerService;
