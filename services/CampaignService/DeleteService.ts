import Campaign from "../../models/Campaign";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const DeleteService = async (
  id: string | number,
  companyId?: string | number
): Promise<void> => {
  const where: any = { id };
  if (companyId !== undefined) {
    where.companyId = companyId;
  }

  const campaign = await Campaign.findOne({ where });

  if (!campaign) {
    throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
  }

  if (campaign.status === "EM_ANDAMENTO") {
    throw new AppError(
      "No puedes eliminar una campaña en ejecución. Cancélala primero.",
      400
    );
  }

  // Import dinámico para evitar ciclos y tolerar que Agente 3 aún no haya
  // creado CleanupCampaignJobsService.
  try {
    const mod: any = await import("./CleanupCampaignJobsService");
    const cleanup =
      (mod && (mod.CleanupCampaignJobsService || mod.default)) || null;
    if (cleanup) {
      await Promise.resolve(cleanup(campaign.id)).catch((err: any) => {
        logger.warn(
          { err: err?.message, campaignId: campaign.id },
          "[CampaignDelete] Cleanup jobs falló, continuando con delete"
        );
      });
    } else {
      logger.warn(
        { campaignId: campaign.id },
        "[CampaignDelete] CleanupCampaignJobsService no exporta función esperada, continuando"
      );
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, campaignId: campaign.id },
      "[CampaignDelete] CleanupCampaignJobsService no disponible aún, continuando con delete"
    );
  }

  await campaign.destroy();

  logger.info(
    { campaignId: id, companyId },
    "[CampaignDelete] Campaña eliminada"
  );
};

export default DeleteService;
