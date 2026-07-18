/**
 * Service: LaunchUGCCampaignService
 * Lanza una campana UGC: transiciona de 'draft'/'paused' a 'producing'
 * y encola tantos jobs de generacion de script como videoCount indica.
 */

import UGCCampaign from "../../models/UGCCampaign";
import UGCVideoJob from "../../models/UGCVideoJob";
import { add } from "../../queues";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { buildCreativeVariation } from "../UGCContentVariationService";

interface LaunchUGCCampaignRequest {
  companyId: number;
  campaignId: number;
}

interface LaunchUGCCampaignResponse {
  campaign: UGCCampaign;
  jobsEnqueued: number;
}

function clampCount(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(Math.floor(parsed), max));
}

function firstReferenceUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const url = value.find(item => {
    if (typeof item !== "string") return false;
    return /^https?:\/\//i.test(item);
  });
  return typeof url === "string" ? url : null;
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

  // Determinar cuantos assets generar
  const genConfig = campaign.generationConfig || {};
  const videoCount = clampCount(genConfig.videoCount, 3, 20);
  const imageCount = clampCount(genConfig.imageCount, 2, 20);
  const totalCount = videoCount + imageCount;
  const referenceImageUrl = firstReferenceUrl(
    (genConfig as Record<string, unknown>).references
  );

  if (totalCount <= 0) {
    throw new AppError("ERR_UGC_CAMPAIGN_EMPTY_CONTENT_BATCH", 400);
  }

  // Encolar jobs de video e imagen con variaciones creativas distintas
  let jobsEnqueued = 0;
  for (let i = 0; i < videoCount; i++) {
    try {
      const variation = buildCreativeVariation(campaign, i, "video");
      const videoJob = await UGCVideoJob.create({
        companyId,
        ugcCampaignId: campaign.id,
        userId: campaign.createdBy,
        stage: "script_generation",
        status: "pending",
        progress: 0,
        scriptVersion: 1,
        mimeType: "video/mp4",
        metadata: {
          creativeKind: "video",
          variantIndex: i + 1,
          totalVariants: videoCount,
          creativeAngle: variation.angle,
          prompt: variation.prompt,
          caption: variation.caption,
          ...(referenceImageUrl ? { referenceImageUrl } : {})
        }
      } as Partial<UGCVideoJob> as UGCVideoJob);

      const queueName = String(genConfig.videoProvider || process.env.UGC_VIDEO_PROVIDER || "").startsWith("fal")
        ? "UGCVideoGenerationQueue"
        : "UGCVideoPipelineQueue";

      await add(queueName, {
        companyId,
        campaignId: campaign.id,
        videoJobId: videoJob.id,
        ...(referenceImageUrl ? { characterImageUrl: referenceImageUrl } : {})
      });
      jobsEnqueued++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[LaunchUGCCampaignService] Error encolando video ${i + 1}/${videoCount}: ${errMsg}`
      );
    }
  }

  for (let i = 0; i < imageCount; i++) {
    try {
      const variantIndex = videoCount + i;
      const variation = buildCreativeVariation(campaign, variantIndex, "image");
      const imageJob = await UGCVideoJob.create({
        companyId,
        ugcCampaignId: campaign.id,
        userId: campaign.createdBy,
        stage: "video_generation",
        status: "pending",
        progress: 0,
        scriptVersion: 1,
        mimeType: "image/png",
        metadata: {
          creativeKind: "image",
          variantIndex: i + 1,
          totalVariants: imageCount,
          creativeAngle: variation.angle,
          prompt: variation.prompt,
          caption: variation.caption
        }
      } as Partial<UGCVideoJob> as UGCVideoJob);

      await add("UGCImageGenerationQueue", {
        companyId,
        campaignId: campaign.id,
        imageJobId: imageJob.id
      });
      jobsEnqueued++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[LaunchUGCCampaignService] Error encolando imagen ${i + 1}/${imageCount}: ${errMsg}`
      );
    }
  }

  logger.info(
    `[LaunchUGCCampaignService] Campana lanzada: id=${campaign.id}, ` +
    `status=producing, jobsEnqueued=${jobsEnqueued}/${totalCount}, ` +
    `company=${companyId}`
  );

  await campaign.reload();

  return { campaign, jobsEnqueued };
};

export default LaunchUGCCampaignService;
