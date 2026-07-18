/**
 * Service: ShowUGCCampaignService
 * Obtiene el detalle completo de una campana UGC.
 * Incluye: videoJobs (con assets), socialPosts, metricas recientes y learnings.
 */

import UGCCampaign from "../../models/UGCCampaign";
import UGCVideoJob from "../../models/UGCVideoJob";
import UGCVideoAsset from "../../models/UGCVideoAsset";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCCampaignMetric from "../../models/UGCCampaignMetric";
import UGCCreativeLearning from "../../models/UGCCreativeLearning";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface ShowUGCCampaignRequest {
  companyId: number;
  campaignId: number;
}

interface ShowUGCCampaignResponse {
  campaign: UGCCampaign;
  metrics: UGCCampaignMetric[];
  learnings: UGCCreativeLearning[];
}

const ShowUGCCampaignService = async (
  params: ShowUGCCampaignRequest
): Promise<ShowUGCCampaignResponse> => {
  const { companyId, campaignId } = params;

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId },
    include: [
      {
        model: UGCVideoJob,
        as: "videoJobs",
        required: false,
        include: [
          {
            model: UGCVideoAsset,
            as: "assets",
            required: false,
            where: { isActive: true }
          }
        ]
      }
    ]
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  // Obtener socialPosts de la campana
  const socialPosts = await UGCSocialPost.findAll({
    where: { ugcCampaignId: campaignId, companyId },
    order: [["createdAt", "DESC"]],
    limit: 50
  });

  // Ultimas 5 metricas
  const metrics = await UGCCampaignMetric.findAll({
    where: { campaignId, companyId },
    order: [["snapshotAt", "DESC"]],
    limit: 5
  });

  // Ultimos 10 learnings
  const learnings = await UGCCreativeLearning.findAll({
    where: { campaignId, companyId, isActive: true },
    order: [["createdAt", "DESC"]],
    limit: 10
  });

  // Adjuntar socialPosts como propiedad virtual
  (campaign as unknown as Record<string, unknown>).socialPosts = socialPosts;

  logger.info(
    `[ShowUGCCampaignService] Detalle: campaign=${campaignId}, ` +
    `videos=${campaign.videoJobs?.length || 0}, posts=${socialPosts.length}, ` +
    `metrics=${metrics.length}, learnings=${learnings.length}, company=${companyId}`
  );

  return { campaign, metrics, learnings };
};

export default ShowUGCCampaignService;
