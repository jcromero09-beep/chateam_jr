/**
 * Service: CreateUGCCampaignService
 * Crea una nueva campana UGC en estado 'draft'.
 * Valida que la company tenga la feature 'useUgc' habilitada en su plan.
 */

import UGCCampaign, {
  UGCProductBrief,
  UGCGenerationConfig,
  UGCPublishConfig,
  UGCOptimizationConfig
} from "../../models/UGCCampaign";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { findAdapter } from "../UGCProviders/fal/adapters/registry";
import type { PipelineMode } from "./PipelineSelectionSchemas";

interface CreateUGCCampaignRequest {
  companyId: number;
  userId: number;
  name: string;
  productBrief: UGCProductBrief;
  generationConfig?: UGCGenerationConfig;
  publishConfig?: UGCPublishConfig;
  optimizationConfig?: UGCOptimizationConfig;
  budget?: number;
  pipelineMode?: PipelineMode;
  videoModelKey?: string | null;
  videoModelDefaults?: Record<string, unknown> | null;
  videoModelMotionReferenceUrl?: string | null;
  audioReferenceUrl?: string | null;
  imageModelKey?: string | null;
  imageModelDefaults?: Record<string, unknown> | null;
  voiceModelKey?: string | null;
  voiceModelDefaults?: Record<string, unknown> | null;
  lipsyncModelKey?: string | null;
  lipsyncModelDefaults?: Record<string, unknown> | null;
}

function validateReferenceUrls(generationConfig: UGCGenerationConfig): void {
  const references = (generationConfig as Record<string, unknown>).references;
  if (!Array.isArray(references)) return;

  const invalidReference = references.find(item => {
    if (typeof item !== "string") return true;
    return item.startsWith("data:") || !/^https?:\/\//i.test(item);
  });

  if (invalidReference) {
    throw new AppError("ERR_UGC_REFERENCE_URL_REQUIRED", 422);
  }
}

const CreateUGCCampaignService = async (
  params: CreateUGCCampaignRequest
): Promise<UGCCampaign> => {
  const {
    companyId,
    userId,
    name,
    productBrief,
    generationConfig,
    publishConfig,
    optimizationConfig,
    budget,
    pipelineMode,
    videoModelKey,
    videoModelDefaults,
    videoModelMotionReferenceUrl,
    audioReferenceUrl,
    imageModelKey,
    imageModelDefaults,
    voiceModelKey,
    voiceModelDefaults,
    lipsyncModelKey,
    lipsyncModelDefaults
  } = params;

  // Validar campos obligatorios
  if (!name || !name.trim()) {
    throw new AppError("ERR_UGC_CAMPAIGN_NAME_REQUIRED", 400);
  }

  // Validar que la company tenga la feature useUgc
  const company = await Company.findOne({
    where: { id: companyId },
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_COMPANY_NOT_FOUND", 404);
  }

  const plan = company.plan;
  if (!plan || !plan.useUgc) {
    throw new AppError("ERR_UGC_FEATURE_NOT_AVAILABLE", 403);
  }

  const normalizedGenerationConfig: UGCGenerationConfig = {
    videoCount: 3,
    imageCount: 2,
    videoDuration: 30,
    videoResolution: "720p",
    aspectRatio: "9:16",
    videoProvider: process.env.UGC_VIDEO_PROVIDER || "fal-wan",
    imageProvider: process.env.UGC_IMAGE_PROVIDER || "fal-flux",
    ...(generationConfig || {})
  };
  validateReferenceUrls(normalizedGenerationConfig);

  const videoAdapter = videoModelKey ? findAdapter(videoModelKey) : null;
  if (videoModelKey && !videoAdapter) {
    throw new AppError("ERR_UGC_VIDEO_MODEL_NOT_FOUND", 422);
  }
  if (
    videoAdapter &&
    !["text-to-video", "image-to-video", "video-to-video"].includes(
      videoAdapter.category
    )
  ) {
    throw new AppError("ERR_UGC_VIDEO_MODEL_INVALID_CATEGORY", 422);
  }
  if (
    videoAdapter?.requiresCampaignAssets?.includes("motionReferenceVideo") &&
    !videoModelMotionReferenceUrl
  ) {
    throw new AppError("ERR_UGC_VIDEO_MODEL_MOTION_REFERENCE_REQUIRED", 422);
  }
  const imageAdapter = imageModelKey ? findAdapter(imageModelKey) : null;
  if (imageModelKey && !imageAdapter) {
    throw new AppError("ERR_UGC_IMAGE_MODEL_NOT_FOUND", 422);
  }
  if (imageAdapter && imageAdapter.category !== "text-to-image") {
    throw new AppError("ERR_UGC_IMAGE_MODEL_INVALID_CATEGORY", 422);
  }
  const voiceAdapter = voiceModelKey ? findAdapter(voiceModelKey) : null;
  if (voiceModelKey && !voiceAdapter) {
    throw new AppError("ERR_UGC_VOICE_MODEL_NOT_FOUND", 422);
  }
  if (voiceAdapter && voiceAdapter.category !== "text-to-speech") {
    throw new AppError("ERR_UGC_VOICE_MODEL_INVALID_CATEGORY", 422);
  }
  if (
    voiceAdapter?.requiresCampaignAssets?.includes("audioReference") &&
    !audioReferenceUrl
  ) {
    throw new AppError("ERR_UGC_VOICE_MODEL_AUDIO_REFERENCE_REQUIRED", 422);
  }
  const lipsyncAdapter = lipsyncModelKey ? findAdapter(lipsyncModelKey) : null;
  if (lipsyncModelKey && !lipsyncAdapter) {
    throw new AppError("ERR_UGC_LIPSYNC_MODEL_NOT_FOUND", 422);
  }

  // Crear campana en estado draft
  const campaign = await UGCCampaign.create({
    companyId,
    createdBy: userId,
    name: name.trim(),
    status: "draft",
    productBrief: productBrief || {},
    generationConfig: normalizedGenerationConfig,
    publishConfig: publishConfig || {},
    optimizationConfig: optimizationConfig || {},
    budget: budget || 0,
    budgetSpent: 0,
    totalVideosGenerated: 0,
    totalPostsPublished: 0,
    pipelineMode: pipelineMode || "image-then-video",
    videoModelKey: videoAdapter?.key ?? null,
    videoModelId: videoAdapter?.modelId ?? null,
    videoModelDefaults: videoModelDefaults || {},
    videoModelMotionReferenceUrl: videoModelMotionReferenceUrl || null,
    imageModelKey: imageAdapter?.key ?? null,
    imageModelId: imageAdapter?.modelId ?? null,
    imageModelDefaults: imageModelDefaults || {},
    voiceModelKey: voiceAdapter?.key ?? null,
    voiceModelDefaults: voiceModelDefaults || {},
    lipsyncModelKey: lipsyncAdapter?.key ?? null,
    lipsyncModelDefaults: lipsyncModelDefaults || {},
    modelSelectedAt: videoAdapter ? new Date() : null,
    modelSelectedBy: videoAdapter ? userId : null,
    metadata: {
      ...(audioReferenceUrl ? { audioReferenceUrl } : {})
    }
  } as Partial<UGCCampaign> as UGCCampaign);

  logger.info(
    `[CreateUGCCampaignService] Campana creada: id=${campaign.id}, ` +
    `name="${campaign.name}", company=${companyId}, user=${userId}`
  );

  return campaign;
};

export default CreateUGCCampaignService;
