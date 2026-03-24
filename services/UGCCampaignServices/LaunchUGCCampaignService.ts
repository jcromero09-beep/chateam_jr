/**
 * Service: LaunchUGCCampaignService
 * Lanza una campana UGC: transiciona de 'draft'/'paused' a 'producing'
 * y encola tantos jobs de generacion de script como videoCount indica.
 */

import UGCCampaign from "../../models/UGCCampaign";
import { add } from "../../queues";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface LaunchUGCCampaignRequest {
  companyId: number;
  campaignId: number;
}

interface LaunchUGCCampaignResponse {
  campaign: UGCCampaign;
  jobsEnqueued: number;
}

const LaunchUGCCampaignService = async (
  params: LaunchUGCCampaignRequest
): Promise<LaunchUGCCampaignResponse> => {
  const { companyId, campaignId } = params;

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  // Solo se puede lanzar desde draft o paused
  if (!["draft", "paused"].includes(campaign.status)) {
    throw new AppError(
      "ERR_UGC_CAMPAIGN_INVALID_STATUS_FOR_LAUNCH",
      400
    );
  }

  // Transicion: draft/paused -> briefing -> producing
  await campaign.update({ status: "briefing" });
  await campaign.update({
    status: "producing",
    startedAt: campaign.startedAt || new Date()
  });

  // Determinar cuantos videos generar
  const genConfig = campaign.generationConfig || {};
  const videoCount = genConfig.videoCount || 3;

  // Encolar jobs de generacion de script
  let jobsEnqueued = 0;
  for (let i = 0; i < videoCount; i++) {
    try {
      await add("UGCScriptGenerationQueue", {
        companyId,
        campaignId: campaign.id,
        index: i + 1,
        totalCount: videoCount,
        generationConfig: genConfig,
        productBrief: campaign.productBrief
      });
      jobsEnqueued++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[LaunchUGCCampaignService] Error encolando job ${i + 1}/${videoCount}: ${errMsg}`
      );
    }
  }

  logger.info(
    `[LaunchUGCCampaignService] Campana lanzada: id=${campaign.id}, ` +
    `status=producing, jobsEnqueued=${jobsEnqueued}/${videoCount}, ` +
    `company=${companyId}`
  );

  await campaign.reload();

  return { campaign, jobsEnqueued };
};

export default LaunchUGCCampaignService;
