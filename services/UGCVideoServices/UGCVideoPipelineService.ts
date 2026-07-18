import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Service: UGCVideoPipelineService
 * Orquestador del pipeline completo de generacion de video UGC.
 * Etapas: script_generation -> avatar_generation -> video_generation -> composition -> review -> completed
 * Cada paso actualiza el pipelineLog del job y avanza al siguiente stage.
 */

import OpenAI from "openai";
import UGCVideoJob, { UGCVideoJobStage } from "../../models/UGCVideoJob";
import UGCCampaign from "../../models/UGCCampaign";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import ComposeUGCVideoService from "./ComposeUGCVideoService";
import { buildCreativeVariation } from "../UGCContentVariationService";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface UGCVideoPipelineRequest {
  companyId: number;
  campaignId: number;
  videoJobId: number;
}

interface UGCVideoPipelineResponse {
  videoJobId: number;
  stage: UGCVideoJobStage;
  status: string;
}

// Providers opcionales — se importan condicionalmente
let HeygenProvider: { generateAvatar: (config: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;
let WanProvider: { generateVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;
let FalVideoProvider: { textToVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;
let KlingProvider: { generateVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;
let RunwayProvider: { generateVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;

try {
  HeygenProvider = require("../UGCProviders/HeygenProvider").default;
} catch {
  logger.warn("[UGCVideoPipelineService] HeygenProvider no disponible");
}

try {
  FalVideoProvider = require("../UGCProviders/fal/FalVideoProvider").default;
} catch {
  logger.warn("[UGCVideoPipelineService] FalVideoProvider no disponible");
}

try {
  WanProvider = require("../UGCProviders/WanProvider").default;
} catch {
  logger.warn("[UGCVideoPipelineService] WanProvider no disponible");
}

try {
  KlingProvider = require("../UGCProviders/KlingProvider").default;
} catch {
  logger.warn("[UGCVideoPipelineService] KlingProvider no disponible");
}

try {
  RunwayProvider = require("../UGCProviders/RunwayProvider").default;
} catch {
  logger.warn("[UGCVideoPipelineService] RunwayProvider no disponible");
}

/**
 * Genera el script del video usando GPT-4o
 */
const handleScriptGeneration = async (
  job: UGCVideoJob,
  campaign: UGCCampaign
): Promise<void> => {
  const startTime = Date.now();
  job.addLogEntry("script_generation", "processing", "Generando script con GPT-4o");
  await job.update({ status: "processing" });

  const productBrief = campaign.productBrief || {};
  const genConfig = campaign.generationConfig || {};
  const variantIndex = Number(job.metadata?.variantIndex || 1) - 1;
  const variation = buildCreativeVariation(campaign, variantIndex, "video");

  const systemPrompt = `Eres un experto en creacion de contenido UGC para redes sociales.
Genera scripts cortos, autenticos y enganchantes para videos de ${genConfig.videoDuration || 30} segundos.
El video sera en formato ${genConfig.aspectRatio || "9:16"} (vertical).
RESPONDE SOLO con el script listo para grabar, sin marcadores ni notas de produccion.`;

  const userPrompt = `Crea un script para un video UGC sobre:
Producto: ${productBrief.productName || "sin especificar"}
Audiencia: ${productBrief.targetAudience || "general"}
Tono: ${productBrief.tone || "casual y autentico"}
CTA: ${productBrief.callToAction || "visita el link en bio"}
Caracteristicas clave: ${(productBrief.keyFeatures || []).join(", ") || "sin especificar"}

Hooks sugeridos: ${(genConfig.hooks || []).join(", ") || "cualquier hook enganchante"}
Angulo creativo obligatorio: ${variation.angle}
Hook recomendado: ${variation.hook}

El script debe incluir:
1. Hook fuerte en los primeros 3 segundos
2. Demostracion o experiencia personal
3. Beneficio principal
4. Call-to-action claro`;

  let script: string | undefined;

  if (openai) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 800
    });

    script = completion.choices[0]?.message?.content;
  } else {
    script = [
      variation.hook,
      `Te cuento rapido por que ${productBrief.productName || campaign.name} me llamo la atencion.`,
      `Lo que mas se nota es: ${(productBrief.keyFeatures || []).join(", ") || "su beneficio principal"}.`,
      `Si quieres probarlo, ${productBrief.callToAction || "revisa el link y mira si encaja contigo"}.`
    ].join(" ");
  }

  if (!script) {
    throw new AppError("ERR_UGC_SCRIPT_GENERATION_EMPTY", 500);
  }

  const durationMs = Date.now() - startTime;
  await job.update({
    script,
    status: "processing",
    metadata: {
      ...(job.metadata || {}),
      creativeKind: "video",
      creativeAngle: variation.angle,
      prompt: variation.prompt,
      caption: variation.caption
    }
  });
  job.addLogEntry("script_generation", "completed", "Script generado exitosamente", {
    durationMs,
    provider: "openai/gpt-5.5"
  });

  // Avanzar al siguiente stage
  await job.advanceStage("avatar_generation");
};

/**
 * Genera el avatar de video usando el provider configurado
 */
const handleAvatarGeneration = async (
  job: UGCVideoJob,
  campaign: UGCCampaign
): Promise<void> => {
  const startTime = Date.now();
  job.addLogEntry("avatar_generation", "processing", "Generando avatar de video");
  await job.update({ status: "processing" });

  const genConfig = campaign.generationConfig || {};
  const provider = genConfig.avatarProvider || "heygen";

  let avatarVideoUrl: string | null = null;
  let usedProvider = provider;

  if (provider === "heygen" && HeygenProvider) {
    try {
      const result = await HeygenProvider.generateAvatar({
        script: job.script,
        voiceId: genConfig.voiceId,
        duration: genConfig.videoDuration || 30,
        companyId: job.companyId
      });
      avatarVideoUrl = result.videoUrl as string;
      usedProvider = "heygen";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Heygen fallo, intentando fallback: ${errMsg}`);
    }
  }

  if (!avatarVideoUrl && provider === "kling" && KlingProvider) {
    try {
      const result = await KlingProvider.generateVideo({
        script: job.script,
        duration: genConfig.videoDuration || 30,
        companyId: job.companyId
      });
      avatarVideoUrl = result.videoUrl as string;
      usedProvider = "kling";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Kling fallo: ${errMsg}`);
    }
  }

  if (!avatarVideoUrl && RunwayProvider) {
    try {
      const result = await RunwayProvider.generateVideo({
        script: job.script,
        duration: genConfig.videoDuration || 30,
        companyId: job.companyId
      });
      avatarVideoUrl = result.videoUrl as string;
      usedProvider = "runway";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Runway fallo: ${errMsg}`);
    }
  }

  if (!avatarVideoUrl) {
    // No hay provider disponible — skip con warning y avanzar
    logger.warn(
      `[UGCVideoPipelineService] Ningun provider de avatar disponible para job=${job.id}. ` +
      `Avanzando sin avatar.`
    );
    job.addLogEntry("avatar_generation", "completed", "Sin provider de avatar disponible, skip", {
      durationMs: Date.now() - startTime
    });
    await job.advanceStage("video_generation");
    return;
  }

  const durationMs = Date.now() - startTime;
  await job.update({
    avatarProvider: usedProvider,
    avatarVideoUrl,
    status: "processing"
  });

  job.addLogEntry("avatar_generation", "completed", `Avatar generado con ${usedProvider}`, {
    durationMs,
    provider: usedProvider
  });

  await job.advanceStage("video_generation");
};

/**
 * Genera el video final con el provider seleccionado
 */
const handleVideoGeneration = async (
  job: UGCVideoJob,
  campaign: UGCCampaign
): Promise<void> => {
  const startTime = Date.now();
  job.addLogEntry("video_generation", "processing", "Generando video");
  await job.update({ status: "processing" });

  // Si ya tenemos avatarVideoUrl, usarlo como rawVideoUrl
  if (job.avatarVideoUrl) {
    await job.update({
      rawVideoUrl: job.avatarVideoUrl,
      videoProvider: job.avatarProvider || "avatar_pass_through"
    });

    job.addLogEntry("video_generation", "completed", "Video base obtenido del avatar", {
      durationMs: Date.now() - startTime,
      provider: job.avatarProvider || "avatar_pass_through"
    });

    await job.advanceStage("composition");
    return;
  }

  // Sin avatar — intentar generacion directa con Wan/ComfyUI, Kling o Runway
  let rawVideoUrl: string | null = null;
  let usedProvider = "none";
  const variantIndex = Number(job.metadata?.variantIndex || 1) - 1;
  const variation = buildCreativeVariation(campaign, variantIndex, "video");
  const preferredProvider = String(campaign.generationConfig?.videoProvider || process.env.UGC_VIDEO_PROVIDER || "wan");

  if (preferredProvider === "fal-wan" && FalVideoProvider) {
    try {
      const result = await FalVideoProvider.textToVideo({
        companyId: job.companyId,
        campaignId: campaign.id,
        videoJobId: job.id,
        prompt: variation.prompt,
        negativePrompt: variation.negativePrompt,
        duration: campaign.generationConfig?.videoDuration || 5,
        aspectRatio: campaign.generationConfig?.aspectRatio || "9:16",
        resolution: campaign.generationConfig?.videoResolution || "720p",
        enablePromptExpansion: true,
        enableSafetyChecker: true,
        model: process.env.FAL_VIDEO_TEXT_MODEL
      });
      rawVideoUrl = result.url as string;
      usedProvider = "fal-wan";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] fal.ai video generation fallo: ${errMsg}`);
    }
  }

  if (!rawVideoUrl && preferredProvider === "wan" && WanProvider) {
    try {
      const result = await WanProvider.generateVideo({
        prompt: variation.prompt,
        negativePrompt: variation.negativePrompt,
        duration: campaign.generationConfig?.videoDuration || 5,
        aspectRatio: campaign.generationConfig?.aspectRatio || "9:16",
        companyId: job.companyId
      });
      rawVideoUrl = result.videoUrl as string;
      usedProvider = "wan";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Wan video generation fallo: ${errMsg}`);
    }
  }

  if (!rawVideoUrl && KlingProvider) {
    try {
      const result = await KlingProvider.generateVideo({
        prompt: variation.prompt || job.script,
        duration: campaign.generationConfig?.videoDuration || 30,
        aspectRatio: campaign.generationConfig?.aspectRatio || "9:16",
        mode: "standard",
        companyId: job.companyId
      });
      rawVideoUrl = result.videoUrl as string;
      usedProvider = "kling";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Kling video generation fallo: ${errMsg}`);
    }
  }

  if (!rawVideoUrl && RunwayProvider) {
    try {
      const result = await RunwayProvider.generateVideo({
        script: job.script,
        duration: campaign.generationConfig?.videoDuration || 30,
        companyId: job.companyId
      });
      rawVideoUrl = result.videoUrl as string;
      usedProvider = "runway";
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[UGCVideoPipelineService] Runway video generation fallo: ${errMsg}`);
    }
  }

  if (!rawVideoUrl) {
    throw new AppError("ERR_UGC_VIDEO_GENERATION_NO_PROVIDER", 500);
  }

  const durationMs = Date.now() - startTime;
  await job.update({
    rawVideoUrl,
    videoProvider: usedProvider,
    status: "processing"
  });

  job.addLogEntry("video_generation", "completed", `Video generado con ${usedProvider}`, {
    durationMs,
    provider: usedProvider
  });

  await job.advanceStage("composition");
};

/**
 * Compone el video final (subtitulos, watermark, intro/outro)
 */
const handleComposition = async (
  job: UGCVideoJob,
  campaign: UGCCampaign
): Promise<void> => {
  const startTime = Date.now();
  job.addLogEntry("composition", "processing", "Componiendo video final");
  await job.update({ status: "processing" });

  const genConfig = campaign.generationConfig || {};

  // Si no hay rawVideoUrl, usar avatarVideoUrl como fallback
  const sourceUrl = job.rawVideoUrl || job.avatarVideoUrl;

  if (!sourceUrl) {
    throw new AppError("ERR_UGC_COMPOSITION_NO_SOURCE_VIDEO", 500);
  }

  await ComposeUGCVideoService({
    companyId: job.companyId,
    videoJobId: job.id,
    rawVideoUrl: sourceUrl,
    options: {
      subtitles: Boolean(genConfig.subtitlesEnabled),
      musicTrack: genConfig.musicEnabled ? String(genConfig.templateId || "") : undefined
    }
  });

  const durationMs = Date.now() - startTime;
  job.addLogEntry("composition", "completed", "Video compuesto exitosamente", {
    durationMs,
    provider: "pass_through"
  });

  await job.advanceStage("review");
};

/**
 * Etapa de review: marca como completado y genera thumbnail
 */
const handleReview = async (
  job: UGCVideoJob,
  campaign: UGCCampaign
): Promise<void> => {
  const startTime = Date.now();
  job.addLogEntry("review", "processing", "Revisando video generado");

  // Marcar como completado
  await job.markAsCompleted();

  // Incrementar contador de videos generados en la campana
  await campaign.update({
    totalVideosGenerated: (campaign.totalVideosGenerated || 0) + 1
  });

  // Deducir credito
  try {
    await DeductCreditsService({
      companyId: job.companyId,
      creditTypeKey: "video",
      amount: 1,
      description: `Video UGC generado: campaign=${campaign.name}, job=${job.id}`,
      source: "video",
      sourceId: String(job.id)
    });
  } catch (creditErr: unknown) {
    const errMsg = creditErr instanceof Error ? creditErr.message : String(creditErr);
    logger.warn(`[UGCVideoPipelineService] Error deduciendo credito: ${errMsg}`);
  }

  const durationMs = Date.now() - startTime;
  job.addLogEntry("review", "completed", "Video completado y aprobado", { durationMs });
  await job.save();

  logger.info(
    `[UGCVideoPipelineService] Pipeline completado: job=${job.id}, ` +
    `campaign=${campaign.id}, company=${job.companyId}`
  );
};

/**
 * Orquestador principal: ejecuta el stage actual del pipeline
 */
const UGCVideoPipelineService = async (
  params: UGCVideoPipelineRequest
): Promise<UGCVideoPipelineResponse> => {
  const { companyId, campaignId, videoJobId } = params;

  const job = await UGCVideoJob.findOne({
    where: { id: videoJobId, companyId, ugcCampaignId: campaignId }
  });

  if (!job) {
    throw new AppError("ERR_UGC_VIDEO_JOB_NOT_FOUND", 404);
  }

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  if (job.status === "completed") {
    return { videoJobId: job.id, stage: job.stage, status: job.status };
  }

  if (job.status === "failed" || job.status === "cancelled") {
    throw new AppError(`ERR_UGC_VIDEO_JOB_${job.status.toUpperCase()}`, 400);
  }

  try {
    switch (job.stage) {
      case "script_generation":
        await handleScriptGeneration(job, campaign);
        break;
      case "avatar_generation":
        await handleAvatarGeneration(job, campaign);
        break;
      case "video_generation":
        await handleVideoGeneration(job, campaign);
        break;
      case "composition":
        await handleComposition(job, campaign);
        break;
      case "review":
        await handleReview(job, campaign);
        break;
      default:
        logger.warn(
          `[UGCVideoPipelineService] Stage desconocido: ${job.stage}, job=${job.id}`
        );
    }
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.markAsFailed(errorMessage);
    logger.error(
      `[UGCVideoPipelineService] Pipeline fallo en stage=${job.stage}: ${errorMessage}`
    );
    throw new AppError("ERR_UGC_VIDEO_PIPELINE_FAILED", 500);
  }

  await job.reload();

  return {
    videoJobId: job.id,
    stage: job.stage,
    status: job.status
  };
};

export default UGCVideoPipelineService;
