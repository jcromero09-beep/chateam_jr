import { createRequire } from "node:module";
import { fal } from "@fal-ai/client";
import { ZodError } from "zod";
import UGCVideoJob from "../../models/UGCVideoJob";
import UGCVideoAsset from "../../models/UGCVideoAsset";
import UGCCampaign from "../../models/UGCCampaign";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { buildCreativeVariation } from "../UGCContentVariationService";
import { resolveFalConfig, resolveFalModels } from "../UGCProviders/fal/FalConfig";
import { getAdapter } from "../UGCProviders/fal/adapters/registry";
import type { FalAdapter } from "../UGCProviders/fal/adapters/types";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import RefundCreditsService from "../AICreditServices/RefundCreditsService";
import {
  buildFalBillingMetadata,
  falCostUsdToCompanyTokens,
  getCreditTypeKeyForAdapter,
  type FalBillingMetadata
} from "../Billing/falCostToCompanyTokens";

const require = createRequire(import.meta.url);

let FluxProvider: {
  generateImage: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;
let FalImageProvider: {
  generateUGCImage: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;

try {
  FalImageProvider = require("../UGCProviders/fal/FalImageProvider").default;
} catch {
  logger.warn("[GenerateUGCImageService] FalImageProvider no disponible");
}

try {
  FluxProvider = require("../UGCProviders/FluxProvider").default;
} catch {
  logger.warn("[GenerateUGCImageService] FluxProvider no disponible");
}

interface GenerateUGCImageRequest {
  companyId: number;
  campaignId: number;
  imageJobId: number;
}

async function ensureCredentials(companyId: number): Promise<void> {
  const config = await resolveFalConfig(companyId);
  if (!config?.apiKey) {
    throw new AppError("ERR_UGC_FAL_API_KEY_NOT_CONFIGURED", 500);
  }
  fal.config({ credentials: config.apiKey });
}

async function runImageAdapter(
  adapter: FalAdapter<unknown, unknown, { images: Array<{ url: string; content_type?: string }> }>,
  runtimeInputs: Record<string, unknown>,
  params: {
    companyId: number;
    campaignId: number;
    imageJobId: number;
  }
): Promise<{
  imageUrl: string;
  mimeType: string;
  billing: FalBillingMetadata;
}> {
  let validated: unknown;
  try {
    validated = adapter.runtimeSchema.parse(runtimeInputs);
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues
        .map(i => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`[GenerateUGCImageService] validación runtime '${adapter.key}': ${detail}`);
    }
    throw err;
  }

  const estimatedCostUsd = adapter.estimateCostUsd(validated);
  const tokensToCharge = falCostUsdToCompanyTokens(estimatedCostUsd);
  const creditTypeKey = getCreditTypeKeyForAdapter(adapter);
  const billing = buildFalBillingMetadata({
    adapter,
    estimatedCostUsd,
    tokensCharged: tokensToCharge,
    creditTypeKey,
    companyId: params.companyId,
    campaignId: params.campaignId,
    videoJobId: params.imageJobId,
    step: "image"
  });

  if (tokensToCharge > 0) {
    await DeductCreditsService({
      companyId: params.companyId,
      creditTypeKey,
      amount: tokensToCharge,
      description: `fal.ai image [${adapter.key}] ($${estimatedCostUsd.toFixed(3)})`,
      source: "fal_ugc_image_generation",
      sourceId: `${params.imageJobId}:image`
    });
  }

  await ensureCredentials(params.companyId);

  let result;
  try {
    result = await fal.subscribe(adapter.modelId, {
      input: adapter.mapInput(validated),
      logs: true
    });
  } catch (falErr) {
    if (tokensToCharge > 0) {
      try {
        await RefundCreditsService({
          companyId: params.companyId,
          creditTypeKey,
          amount: tokensToCharge,
          description: `Refund fal.ai image failed: ${String(falErr).slice(0, 180)}`,
          source: "fal_ugc_image_generation_refund",
          sourceId: `${params.imageJobId}:image`
        });
        billing.refundedAt = new Date().toISOString();
        billing.refundReason = String(falErr).slice(0, 180);
      } catch (refundErr) {
        logger.error(
          `[GenerateUGCImageService] refund FALLÓ tras fal-error: ${String(refundErr)}`
        );
      }
    }
    throw falErr;
  }

  const output = adapter.mapOutput(result.data);
  const image = output.images?.[0];
  if (!image?.url) {
    throw new Error("[GenerateUGCImageService] adapter no devolvió images[0].url");
  }

  billing.requestId = result.requestId;
  return {
    imageUrl: image.url,
    mimeType: image.content_type || "image/png",
    billing
  };
}

const GenerateUGCImageService = async (
  params: GenerateUGCImageRequest
): Promise<UGCVideoJob> => {
  const { companyId, campaignId, imageJobId } = params;

  const job = await UGCVideoJob.findOne({
    where: { id: imageJobId, companyId, ugcCampaignId: campaignId }
  });

  if (!job) {
    throw new AppError("ERR_UGC_IMAGE_JOB_NOT_FOUND", 404);
  }

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  const variantIndex = Number(job.metadata?.variantIndex || 1) - 1;
  const variation = buildCreativeVariation(campaign, variantIndex, "image");
  const genConfig = campaign.generationConfig || {};
  const preferredProvider = String(genConfig.imageProvider || process.env.UGC_IMAGE_PROVIDER || "fal-flux");

  await job.update({
    status: "processing",
    stage: "video_generation",
    script: variation.caption,
    metadata: {
      ...job.metadata,
      creativeKind: "image",
      creativeAngle: variation.angle,
      prompt: variation.prompt,
      caption: variation.caption
    }
  });

  try {
    if (campaign.imageModelKey) {
      const adapter = getAdapter(campaign.imageModelKey);
      if (adapter.category !== "text-to-image") {
        throw new AppError("ERR_UGC_IMAGE_MODEL_INVALID_CATEGORY", 422);
      }

      const { imageUrl, mimeType, billing } = await runImageAdapter(
        adapter as FalAdapter<unknown, unknown, { images: Array<{ url: string; content_type?: string }> }>,
        {
          ...(campaign.imageModelDefaults || {}),
          prompt: variation.prompt
        },
        {
          companyId,
          campaignId: campaign.id,
          imageJobId: job.id
        }
      );

      await UGCVideoAsset.create({
        companyId,
        ugcVideoJobId: job.id,
        ugcCampaignId: campaign.id,
        assetType: "generated_image",
        fileName: imageUrl.split("/").pop() || `ugc_image_${campaign.id}_${job.id}.png`,
        localPath: imageUrl,
        originalUrl: imageUrl,
        fileSize: 0,
        mimeType,
        version: 1,
        isActive: true,
        downloadCount: 0,
        metadata: {
          provider: "fal",
          modelKey: adapter.key,
          creativeAngle: variation.angle,
          prompt: variation.prompt,
          caption: variation.caption,
          billing
        }
      } as Partial<UGCVideoAsset> as UGCVideoAsset);

      await job.update({
        status: "completed",
        stage: "completed",
        finalVideoUrl: imageUrl,
        thumbnailUrl: imageUrl,
        videoProvider: "fal",
        mimeType,
        progress: 100
      });

      await campaign.update({
        metadata: {
          ...(campaign.metadata || {}),
          totalImagesGenerated: Number(campaign.metadata?.totalImagesGenerated || 0) + 1
        }
      });

      return job;
    }

    if (preferredProvider === "fal-flux") {
      if (!FalImageProvider) {
        throw new AppError("ERR_UGC_FAL_IMAGE_PROVIDER_NOT_AVAILABLE", 503);
      }
      const falModels = await resolveFalModels(companyId);

      const falResult = await FalImageProvider.generateUGCImage({
        companyId,
        campaignId,
        videoJobId: job.id,
        prompt: variation.prompt,
        negativePrompt: variation.negativePrompt,
        aspectRatio: genConfig.aspectRatio || "1:1",
        model: falModels.imageModel
      });

      const imageUrl = falResult.url as string;
      await job.update({
        status: "completed",
        stage: "completed",
        finalVideoUrl: imageUrl,
        thumbnailUrl: imageUrl,
        videoProvider: "fal-flux",
        mimeType: "image/png",
        progress: 100
      });

      return job;
    }

    if (!FluxProvider) {
      throw new AppError("ERR_UGC_IMAGE_PROVIDER_NOT_AVAILABLE", 503);
    }

    const result = await FluxProvider.generateImage({
      prompt: variation.prompt,
      negativePrompt: variation.negativePrompt,
      aspectRatio: genConfig.aspectRatio || "1:1",
      companyId
    });

    const imageUrl = result.imageUrl as string;
    const fileName = (result.fileName as string) || `ugc_image_${campaign.id}_${job.id}.png`;
    const mimeType = (result.mimeType as string) || "image/png";

    await UGCVideoAsset.create({
      companyId,
      ugcVideoJobId: job.id,
      ugcCampaignId: campaign.id,
      assetType: "generated_image",
      fileName,
      localPath: imageUrl,
      originalUrl: imageUrl,
      fileSize: 0,
      mimeType,
      version: 1,
      isActive: true,
      downloadCount: 0,
      metadata: {
        provider: "flux",
        providerJobId: result.taskId,
        creativeAngle: variation.angle,
        prompt: variation.prompt,
        caption: variation.caption
      }
    } as Partial<UGCVideoAsset> as UGCVideoAsset);

    await job.update({
      status: "completed",
      stage: "completed",
      finalVideoUrl: imageUrl,
      thumbnailUrl: imageUrl,
      videoProvider: "flux",
      mimeType,
      progress: 100
    });

    await campaign.update({
      metadata: {
        ...(campaign.metadata || {}),
        totalImagesGenerated: Number(campaign.metadata?.totalImagesGenerated || 0) + 1
      }
    });

    return job;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.markAsFailed(errorMessage);
    logger.error(`[GenerateUGCImageService] Error generando imagen: ${errorMessage}`);
    throw new AppError("ERR_UGC_IMAGE_GENERATION_FAILED", 500);
  }
};

export default GenerateUGCImageService;
