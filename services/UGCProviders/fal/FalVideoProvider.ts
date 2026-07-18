import UGCVideoAsset from "../../../models/UGCVideoAsset";
import UGCVideoJob from "../../../models/UGCVideoJob";
import FalClient from "./FalClient";
import { resolveFalModels } from "./FalConfig";
import { FalGeneratedAsset, FalUGCVideoInput, FalVideoFile, FalVideoInput } from "./types";

const TEXT_TO_VIDEO_MODEL = process.env.FAL_VIDEO_TEXT_MODEL || "fal-ai/wan-25-preview/text-to-video";
const IMAGE_TO_VIDEO_MODEL = process.env.FAL_VIDEO_IMAGE_MODEL || "fal-ai/wan-25-preview/image-to-video";
const PREMIUM_VIDEO_MODEL = process.env.FAL_VIDEO_PREMIUM_MODEL || "fal-ai/seedance/v2/image-to-video";
const ESTIMATED_VIDEO_COST_USD = Number(process.env.FAL_VIDEO_ESTIMATED_COST_USD || 0);

function modelMetadata(job: UGCVideoJob): Record<string, unknown> {
  return (job.metadata || {}) as Record<string, unknown>;
}

async function persistCompletedVideo(
  input: FalUGCVideoInput,
  model: string,
  video: FalVideoFile,
  requestId?: string
): Promise<FalGeneratedAsset> {
  const asset = await UGCVideoAsset.create({
    companyId: input.companyId,
    ugcVideoJobId: input.videoJobId,
    ugcCampaignId: input.campaignId,
    assetType: "raw_video",
    fileName: video.file_name || `fal_video_${input.campaignId}_${input.videoJobId}.mp4`,
    localPath: video.url,
    originalUrl: video.url,
    fileSize: video.file_size || 0,
    mimeType: video.content_type || "video/mp4",
    duration: input.duration || null,
    version: 1,
    isActive: true,
    downloadCount: 0,
    metadata: {
      provider: "fal",
      model,
      requestId,
      externalUrl: video.url,
      prompt: input.prompt
    }
  } as Partial<UGCVideoAsset> as UGCVideoAsset);

  const job = await UGCVideoJob.findByPk(input.videoJobId);
  if (job) {
    await job.update({
      rawVideoUrl: video.url,
      videoProvider: "fal",
      videoProviderJobId: requestId,
      metadata: {
        ...modelMetadata(job),
        falRequestId: requestId,
        falModel: model,
        falStatus: "COMPLETED",
        falOutputUrl: video.url
      }
    });
  }

  return {
    assetId: asset.id,
    url: video.url,
    costUSD: ESTIMATED_VIDEO_COST_USD,
    metadata: {
      provider: "fal",
      model,
      requestId,
      externalUrl: video.url
    }
  };
}

async function runVideoNow(input: FalUGCVideoInput, model: string): Promise<FalGeneratedAsset> {
  const result = await FalClient.runVideo({ ...input, model });
  if (result.success === false) {
    throw new Error(result.error);
  }

  return persistCompletedVideo(input, model, result.data.video, result.requestId);
}

async function submitVideo(input: FalUGCVideoInput, model: string): Promise<FalGeneratedAsset> {
  const falModels = await resolveFalModels(input.companyId);
  const webhookUrl = input.webhookUrl || falModels.webhookUrl;
  if (!webhookUrl) {
    throw new Error("FAL_WEBHOOK_PUBLIC_URL is required for fal video submit");
  }

  const result = await FalClient.submitVideo({ ...input, model }, { webhookUrl, priority: "normal" });
  if (result.success === false) {
    throw new Error(result.error);
  }

  const job = await UGCVideoJob.findByPk(input.videoJobId);
  if (job) {
    await job.update({
      status: "processing",
      videoProvider: "fal",
      videoProviderJobId: result.data.requestId,
      metadata: {
        ...modelMetadata(job),
        falRequestId: result.data.requestId,
        falModel: model,
        falStatus: result.data.status,
        falSubmittedAt: new Date().toISOString(),
        falStatusUrl: result.data.statusUrl,
        falResponseUrl: result.data.responseUrl,
        prompt: input.prompt
      }
    });
  }

  return {
    url: "",
    costUSD: ESTIMATED_VIDEO_COST_USD,
    metadata: {
      provider: "fal",
      model,
      requestId: result.data.requestId
    }
  };
}

async function textToVideo(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return runVideoNow(input, input.model || TEXT_TO_VIDEO_MODEL);
}

async function imageToVideo(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return runVideoNow(input, input.model || IMAGE_TO_VIDEO_MODEL);
}

async function premiumRender(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return runVideoNow(input, input.model || PREMIUM_VIDEO_MODEL);
}

async function submitTextToVideo(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return submitVideo(input, input.model || TEXT_TO_VIDEO_MODEL);
}

async function submitImageToVideo(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return submitVideo(input, input.model || IMAGE_TO_VIDEO_MODEL);
}

async function submitPremiumRender(input: FalUGCVideoInput): Promise<FalGeneratedAsset> {
  return submitVideo(input, input.model || PREMIUM_VIDEO_MODEL);
}

export type { FalVideoInput };
export default {
  textToVideo,
  imageToVideo,
  premiumRender,
  submitTextToVideo,
  submitImageToVideo,
  submitPremiumRender
};

export {
  textToVideo,
  imageToVideo,
  premiumRender,
  submitTextToVideo,
  submitImageToVideo,
  submitPremiumRender
};
