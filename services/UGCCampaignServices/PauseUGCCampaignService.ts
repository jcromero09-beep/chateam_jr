/**
 * Service: PauseUGCCampaignService
 * Pausa una campana UGC que este en estado activo, producing, publishing u optimizing.
 */

import UGCCampaign from "../../models/UGCCampaign";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface PauseUGCCampaignRequest {
  companyId: number;
  campaignId: number;
}

const PauseUGCCampaignService = async (
  params: PauseUGCCampaignRequest
): Promise<UGCCampaign> => {
  const { companyId, campaignId } = params;

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  // Solo se puede pausar desde estos estados
  const pausableStatuses = ["active", "producing", "publishing", "optimizing"];

  if (!pausableStatuses.includes(campaign.status)) {
    throw new AppError(
      "ERR_UGC_CAMPAIGN_INVALID_STATUS_FOR_PAUSE",
      400
    );
  }

  const previousStatus = campaign.status;
  await campaign.update({
    status: "paused",
    metadata: {
      ...campaign.metadata,
      pausedAt: new Date().toISOString(),
      pausedFromStatus: previousStatus
    }
  });

  logger.info(
    `[PauseUGCCampaignService] Campana pausada: id=${campaignId}, ` +
    `previousStatus=${previousStatus}, company=${companyId}`
  );

  await campaign.reload();
  return campaign;
};

export default PauseUGCCampaignService;
