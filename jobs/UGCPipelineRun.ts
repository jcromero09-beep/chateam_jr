/**
 * Job: UGCPipelineRun
 *
 * Orquesta los 4 pasos del pipeline UGC según UGCCampaign.pipelineMode:
 *   1. (opc) Imagen base   — text-to-image
 *   2. Video               — image-to-video | text-to-video | motion-control
 *   3. (opc) Voz           — text-to-speech
 *   4. (opc) Lipsync       — audio+video → video sincronizado
 *
 * Reglas:
 *   - Si videoModelKey no está configurado → fail-fast.
 *   - Si motion-control sin motionReferenceUrl → fail-fast.
 *   - Persiste UN UGCVideoAsset por paso con assetType específico para
 *     trazabilidad ('generated_image' | 'raw_video' | 'voice_audio' |
 *     'composed_final').
 *   - El image-to-video del paso 2 usa el output del paso 1; si el modo
 *     es text-to-video-direct, salta el paso 1.
 *
 * NOTA: este job ejecuta los modelos en modo síncrono (fal.subscribe vía
 * adapter.runtimeSchema + fal.queue + polling). El submit asíncrono con
 * webhook se mantiene como modo del PR #1 vía submitWithAdapter.ts.
 * Aquí elegimos síncrono porque encadenar 4 webhooks es complejo y la
 * orquestación con Bull ya nos da retry/observabilidad.
 */

import { Job } from "bull";
import { fal } from "@fal-ai/client";
import { ZodError } from "zod";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCCampaign from "../models/UGCCampaign";
import UGCVideoAsset from "../models/UGCVideoAsset";
import { resolveFalConfig } from "../services/UGCProviders/fal/FalConfig";
import {
  findAdapter,
  getAdapter
} from "../services/UGCProviders/fal/adapters/registry";
import type { FalAdapter } from "../services/UGCProviders/fal/adapters/types";
import { FalProviderError } from "../services/UGCProviders/fal/errors";
import { buildCreativeVariation } from "../services/UGCContentVariationService";
import DeductCreditsService from "../services/AICreditServices/DeductCreditsService";
import RefundCreditsService from "../services/AICreditServices/RefundCreditsService";
import {
  buildFalBillingMetadata,
  falCostUsdToCompanyTokens,
  getCreditTypeKeyForAdapter,
  type FalBillingMetadata
} from "../services/Billing/falCostToCompanyTokens";
import logger from "../utils/logger";

export interface UGCPipelineRunJobData {
  companyId: number;
  campaignId: number;
  videoJobId: number;
  agentIdentityId: number;
  scriptData: {
    hook: string;
    body: string;
    cta: string;
    fullScript: string;
  };
  platform?: string;
  videoStyle?: string;
  /** Imagen pregenerada del personaje (PR #1 retrocompat). Si está
   *  presente y el modo es image-then-video, salta el paso 1. */
  characterImageUrl?: string;
  /** Audio de referencia para TTS con voice clone (F5-TTS). */
  audioReferenceUrl?: string;
}

interface PipelineContext {
  campaignId: number;
  companyId: number;
  videoJobId: number;
  prompt: string;
  negativePrompt: string;
  characterImageUrl: string | null;
  motionReferenceUrl: string | null;
  audioReferenceUrl: string | null;
  voiceText: string;
}

interface PipelineResult {
  baseImageUrl: string | null;
  videoUrl: string;
  audioUrl: string | null;
  finalVideoUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureCredentials(companyId: number): Promise<void> {
  const config = await resolveFalConfig(companyId);
  if (!config?.apiKey) {
    throw new FalProviderError(
      "Fal.ai API key is not configured for company",
      "validation",
      500
    );
  }
  fal.config({ credentials: config.apiKey });
}

interface BillingContext {
  companyId: number;
  campaignId: number;
  videoJobId: number;
}

interface RunAdapterResult<TOut> {
  output: TOut;
  billing: FalBillingMetadata;
}

/**
 * Ejecuta un adapter en modo síncrono (fal.subscribe) y aplica cobro
 * por paso:
 *   1) Validar runtime con runtimeSchema.
 *   2) Estimar costo USD → convertir a tokens internos.
 *   3) DeductCreditsService (si tokens > 0). 402 si no hay saldo.
 *   4) fal.subscribe.
 *   5) Si fal falla → RefundCreditsService automático.
 *   6) Devolver output + billing metadata para auditoría.
 */
async function runAdapter<TOut>(
  adapter: FalAdapter<unknown, unknown, TOut>,
  runtimeInputs: Record<string, unknown>,
  label: string,
  billingContext: BillingContext
): Promise<RunAdapterResult<TOut>> {
  // ---- 1. Validar runtime ----
  let validated: unknown;
  try {
    validated = adapter.runtimeSchema.parse(runtimeInputs);
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues
        .map(i => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(
        `[UGCPipelineRun:${label}] validación runtime '${adapter.key}': ${detail}`
      );
    }
    throw err;
  }

  // ---- 2. Estimar costo y convertir a tokens ----
  const estimatedCostUsd = adapter.estimateCostUsd(validated);
  const tokensToCharge = falCostUsdToCompanyTokens(estimatedCostUsd);
  const creditTypeKey = getCreditTypeKeyForAdapter(adapter);

  const billing: FalBillingMetadata = buildFalBillingMetadata({
    adapter,
    estimatedCostUsd,
    tokensCharged: tokensToCharge,
    creditTypeKey,
    companyId: billingContext.companyId,
    campaignId: billingContext.campaignId,
    videoJobId: billingContext.videoJobId,
    step: label
  });

  // ---- 3. Cobrar ANTES del submit (si tokens > 0) ----
  // tokensToCharge === 0 → no descontar ni refundear (regla explícita).
  if (tokensToCharge > 0) {
    try {
      await DeductCreditsService({
        companyId: billingContext.companyId,
        creditTypeKey,
        amount: tokensToCharge,
        description: `fal.ai ${label} [${adapter.key}] ($${estimatedCostUsd.toFixed(3)})`,
        source: "fal_pipeline_run",
        sourceId: `${billingContext.videoJobId}:${label}`
      });
      logger.info(
        `[UGCPipelineRun:${label}] charged ${tokensToCharge} tokens (${creditTypeKey}) ` +
          `company=${billingContext.companyId} estUsd=${estimatedCostUsd}`
      );
    } catch (err) {
      // ERR_AI_INSUFFICIENT_CREDITS (402) o similares — NO se envió a fal.
      logger.warn(
        `[UGCPipelineRun:${label}] cobro falló — NO se llama a fal. ` +
          `company=${billingContext.companyId} tokens=${tokensToCharge}: ${String(err)}`
      );
      throw err;
    }
  }

  // ---- 4. Submit a fal.ai ----
  const mapped = adapter.mapInput(validated);
  logger.info(
    `[UGCPipelineRun:${label}] subscribe adapter=${adapter.key} model=${adapter.modelId}`
  );

  let result;
  try {
    result = await fal.subscribe(adapter.modelId, {
      input: mapped,
      logs: true
    });
  } catch (falErr) {
    // ---- 5. Refund automático si fal falló ----
    if (tokensToCharge > 0) {
      try {
        await RefundCreditsService({
          companyId: billingContext.companyId,
          creditTypeKey,
          amount: tokensToCharge,
          description: `Refund fal.ai ${label} failed: ${String(falErr).slice(0, 180)}`,
          source: "fal_pipeline_run_refund",
          sourceId: `${billingContext.videoJobId}:${label}`
        });
        billing.refundedAt = new Date().toISOString();
        billing.refundReason = String(falErr).slice(0, 180);
        logger.warn(
          `[UGCPipelineRun:${label}] refund OK por fal-error: ${tokensToCharge} tokens`
        );
      } catch (refundErr) {
        // No-op para no enmascarar el error original de fal — solo loguear.
        logger.error(
          `[UGCPipelineRun:${label}] refund FALLÓ tras fal-error. ` +
            `Reconciliar manual: tokens=${tokensToCharge} company=${billingContext.companyId}: ${String(refundErr)}`
        );
      }
    }
    throw falErr;
  }

  logger.info(
    `[UGCPipelineRun:${label}] OK adapter=${adapter.key} requestId=${result.requestId}`
  );
  billing.requestId = result.requestId;
  return { output: adapter.mapOutput(result.data), billing };
}

async function persistAsset(opts: {
  campaign: UGCCampaign;
  videoJob: UGCVideoJob;
  assetType:
    | "generated_image"
    | "raw_video"
    | "voice_audio"
    | "composed_final";
  url: string;
  mimeType: string;
  step: string;
  modelKey: string;
  billing?: FalBillingMetadata;
}): Promise<UGCVideoAsset> {
  return UGCVideoAsset.create({
    companyId: opts.campaign.companyId,
    ugcVideoJobId: opts.videoJob.id,
    ugcCampaignId: opts.campaign.id,
    assetType: opts.assetType,
    fileName: opts.url.split("/").pop() || `${opts.assetType}.bin`,
    localPath: opts.url,
    originalUrl: opts.url,
    fileSize: 0,
    mimeType: opts.mimeType,
    version: 1,
    isActive: true,
    downloadCount: 0,
    metadata: {
      provider: "fal",
      step: opts.step,
      modelKey: opts.modelKey,
      pipelineMode: opts.campaign.pipelineMode,
      billing: opts.billing ?? null
    }
  } as Partial<UGCVideoAsset> as UGCVideoAsset);
}

// ---------------------------------------------------------------------------
// Pasos del pipeline
// ---------------------------------------------------------------------------

async function runImageStep(
  campaign: UGCCampaign,
  videoJob: UGCVideoJob,
  ctx: PipelineContext
): Promise<string | null> {
  // Si ya hay imagen pregenerada (PR #1 retrocompat), úsala.
  if (ctx.characterImageUrl) {
    logger.info(
      `[UGCPipelineRun:image] reusando characterImageUrl pregenerada`
    );
    return ctx.characterImageUrl;
  }

  if (!campaign.imageModelKey) {
    throw new Error(
      `[UGCPipelineRun:image] modo '${campaign.pipelineMode}' requiere imageModelKey y no está configurado`
    );
  }

  const adapter = getAdapter(campaign.imageModelKey);
  if (adapter.category !== "text-to-image") {
    throw new Error(
      `[UGCPipelineRun:image] adapter '${adapter.key}' tiene categoría ` +
        `'${adapter.category}' — se esperaba text-to-image`
    );
  }

  const { output, billing } = await runAdapter(
    adapter as FalAdapter<unknown, unknown, { images: Array<{ url: string }> }>,
    {
      ...(campaign.imageModelDefaults || {}),
      prompt: ctx.prompt
    },
    "image",
    {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      videoJobId: videoJob.id
    }
  );

  const firstImage = output.images?.[0]?.url;
  if (!firstImage) {
    throw new Error("[UGCPipelineRun:image] adapter no devolvió images[0].url");
  }

  await persistAsset({
    campaign,
    videoJob,
    assetType: "generated_image",
    url: firstImage,
    mimeType: "image/png",
    step: "base-image",
    modelKey: adapter.key,
    billing
  });

  return firstImage;
}

async function runVideoStep(
  campaign: UGCCampaign,
  videoJob: UGCVideoJob,
  ctx: PipelineContext,
  baseImageUrl: string | null
): Promise<string> {
  if (!campaign.videoModelKey) {
    throw new Error(
      `[UGCPipelineRun:video] Campaign ${campaign.id} no tiene videoModelKey configurado. ` +
        `Configúralo en /ugc/campaigns/${campaign.id}/model-selector antes de generar.`
    );
  }

  const adapter = getAdapter(campaign.videoModelKey);

  // Motion-control requiere video de referencia
  if (
    adapter.requiresCampaignAssets?.includes("motionReferenceVideo") &&
    !ctx.motionReferenceUrl
  ) {
    throw new Error(
      `[UGCPipelineRun:video] adapter '${adapter.key}' requiere motion-reference ` +
        `pero la campaña ${campaign.id} no tiene videoModelMotionReferenceUrl`
    );
  }

  // Runtime inputs según categoría
  const runtimeInputs: Record<string, unknown> = {
    ...(campaign.videoModelDefaults || {}),
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt
  };

  if (adapter.category === "text-to-video") {
    if (baseImageUrl) {
      logger.warn(
        "[UGCPipelineRun:video] baseImageUrl presente pero adapter es text-to-video — ignorada"
      );
    }
  } else {
    // image-to-video o video-to-video (motion-control)
    if (!baseImageUrl) {
      throw new Error(
        `[UGCPipelineRun:video] adapter '${adapter.key}' requiere baseImageUrl ` +
          `(producida por step 1 o por characterImageUrl pregenerado)`
      );
    }
    // Pasamos las distintas keys: el adapter usa la que necesita
    runtimeInputs.image_url = baseImageUrl;
    runtimeInputs.start_image_url = baseImageUrl;
  }

  if (adapter.category === "video-to-video" && ctx.motionReferenceUrl) {
    runtimeInputs.video_url = ctx.motionReferenceUrl;
  }

  const { output, billing } = await runAdapter(
    adapter as FalAdapter<unknown, unknown, { video: { url: string } }>,
    runtimeInputs,
    "video",
    {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      videoJobId: videoJob.id
    }
  );

  await persistAsset({
    campaign,
    videoJob,
    assetType: "raw_video",
    url: output.video.url,
    mimeType: "video/mp4",
    step: "raw-video",
    modelKey: adapter.key,
    billing
  });

  return output.video.url;
}

async function runVoiceStep(
  campaign: UGCCampaign,
  videoJob: UGCVideoJob,
  ctx: PipelineContext
): Promise<string | null> {
  if (!campaign.voiceModelKey) return null;

  const adapter = getAdapter(campaign.voiceModelKey);
  if (adapter.category !== "text-to-speech") {
    throw new Error(
      `[UGCPipelineRun:voice] adapter '${adapter.key}' tiene categoría ` +
        `'${adapter.category}' — se esperaba text-to-speech`
    );
  }

  // F5-TTS requiere ref_audio_url; ElevenLabs no.
  const runtimeInputs: Record<string, unknown> = {
    ...(campaign.voiceModelDefaults || {}),
    // ElevenLabs usa `text`, F5-TTS usa `gen_text`. Pasamos ambas.
    text: ctx.voiceText,
    gen_text: ctx.voiceText
  };

  if (
    adapter.requiresCampaignAssets?.includes("audioReference") &&
    ctx.audioReferenceUrl
  ) {
    runtimeInputs.ref_audio_url = ctx.audioReferenceUrl;
  } else if (adapter.requiresCampaignAssets?.includes("audioReference")) {
    throw new Error(
      `[UGCPipelineRun:voice] adapter '${adapter.key}' requiere audioReferenceUrl ` +
        `para voice cloning`
    );
  }

  // El adapter tiene tipos distintos según el TTS, normalizamos a 'audio'
  const { output, billing } = await runAdapter(
    adapter as FalAdapter<
      unknown,
      unknown,
      { audio?: { url: string }; audio_url?: { url: string } }
    >,
    runtimeInputs,
    "voice",
    {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      videoJobId: videoJob.id
    }
  );

  const audioUrl = output.audio?.url ?? output.audio_url?.url;
  if (!audioUrl) {
    throw new Error("[UGCPipelineRun:voice] adapter no devolvió audio URL");
  }

  await persistAsset({
    campaign,
    videoJob,
    assetType: "voice_audio",
    url: audioUrl,
    mimeType: "audio/mpeg",
    step: "voice-audio",
    modelKey: adapter.key,
    billing
  });

  return audioUrl;
}

async function runLipsyncStep(
  campaign: UGCCampaign,
  videoJob: UGCVideoJob,
  videoUrl: string,
  audioUrl: string | null
): Promise<string | null> {
  if (!campaign.lipsyncModelKey || !audioUrl) return null;

  const adapter = getAdapter(campaign.lipsyncModelKey);
  if (adapter.category !== "lipsync") {
    throw new Error(
      `[UGCPipelineRun:lipsync] adapter '${adapter.key}' tiene categoría ` +
        `'${adapter.category}' — se esperaba lipsync`
    );
  }

  const runtimeInputs: Record<string, unknown> = {
    ...(campaign.lipsyncModelDefaults || {}),
    video_url: videoUrl,
    audio_url: audioUrl
  };

  const { output, billing } = await runAdapter(
    adapter as FalAdapter<unknown, unknown, { video: { url: string } }>,
    runtimeInputs,
    "lipsync",
    {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      videoJobId: videoJob.id
    }
  );

  await persistAsset({
    campaign,
    videoJob,
    assetType: "composed_final",
    url: output.video.url,
    mimeType: "video/mp4",
    step: "final-video",
    modelKey: adapter.key,
    billing
  });

  return output.video.url;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const handle = async (job: Job<UGCPipelineRunJobData>): Promise<PipelineResult> => {
  const { companyId, campaignId, videoJobId, characterImageUrl, audioReferenceUrl } =
    job.data;

  const videoJob = await UGCVideoJob.findOne({
    where: { id: videoJobId, companyId, ugcCampaignId: campaignId }
  });
  if (!videoJob) {
    throw new Error(`UGCVideoJob not found: ${videoJobId}`);
  }

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });
  if (!campaign) {
    throw new Error(`UGCCampaign not found: ${campaignId}`);
  }

  const variantIndex = Number(videoJob.metadata?.variantIndex || 1) - 1;
  const variation = buildCreativeVariation(campaign, variantIndex, "video");
  const prompt = String(videoJob.metadata?.prompt || variation.prompt);

  const campaignAudioReferenceUrl =
    typeof campaign.metadata?.audioReferenceUrl === "string"
      ? campaign.metadata.audioReferenceUrl
      : null;

  const ctx: PipelineContext = {
    campaignId: campaign.id,
    companyId,
    videoJobId: videoJob.id,
    prompt,
    negativePrompt: variation.negativePrompt,
    characterImageUrl: characterImageUrl ?? null,
    motionReferenceUrl: campaign.videoModelMotionReferenceUrl ?? null,
    audioReferenceUrl: audioReferenceUrl ?? campaignAudioReferenceUrl,
    // El texto a sintetizar es el fullScript (hook + body + cta)
    voiceText:
      job.data.scriptData?.fullScript ||
      `${job.data.scriptData?.hook ?? ""} ${job.data.scriptData?.body ?? ""} ${job.data.scriptData?.cta ?? ""}`.trim() ||
      prompt
  };

  await ensureCredentials(companyId);

  logger.info(
    `[UGCPipelineRun] start campaign=${campaign.id} mode=${campaign.pipelineMode} ` +
      `video=${campaign.videoModelKey} voice=${campaign.voiceModelKey ?? "-"} ` +
      `lipsync=${campaign.lipsyncModelKey ?? "-"}`
  );

  await videoJob.update({
    status: "processing",
    videoProvider: "fal",
    metadata: {
      ...(videoJob.metadata || {}),
      pipelineMode: campaign.pipelineMode,
      pipelineStartedAt: new Date().toISOString()
    }
  });

  // --- Paso 1: imagen base (solo si el modo lo requiere) ---
  let baseImageUrl: string | null = null;
  if (campaign.pipelineMode !== "text-to-video-direct") {
    baseImageUrl = await runImageStep(campaign, videoJob, ctx);
  }

  // --- Paso 2: video ---
  const videoUrl = await runVideoStep(campaign, videoJob, ctx, baseImageUrl);

  // --- Paso 3: voz (opcional) ---
  const audioUrl = await runVoiceStep(campaign, videoJob, ctx);

  // --- Paso 4: lipsync (opcional, requiere voz) ---
  const finalUrl =
    (await runLipsyncStep(campaign, videoJob, videoUrl, audioUrl)) ?? videoUrl;

  await videoJob.update({
    status: "completed",
    rawVideoUrl: videoUrl,
    finalVideoUrl: finalUrl,
    metadata: {
      ...(videoJob.metadata || {}),
      pipelineCompletedAt: new Date().toISOString(),
      baseImageUrl,
      audioUrl
    }
  });

  logger.info(
    `[UGCPipelineRun] completed campaign=${campaign.id} finalUrl=${finalUrl}`
  );

  return {
    baseImageUrl,
    videoUrl,
    audioUrl,
    finalVideoUrl: finalUrl
  };
};

export default handle;
