/**
 * Service: ComposeUGCVideoService
 * Composicion final del video UGC.
 * Aplica subtitulos, watermark, intro/outro y musica de fondo.
 * Usa FFmpegProvider o CreatomateProvider segun disponibilidad.
 */

import UGCVideoJob from "../../models/UGCVideoJob";
import UGCVideoAsset from "../../models/UGCVideoAsset";
import UGCCampaign from "../../models/UGCCampaign";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// Providers opcionales
let FFmpegProvider: {
  compose: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  generateThumbnail: (videoUrl: string) => Promise<string>;
} | null = null;

let CreatomateProvider: {
  compose: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  generateThumbnail: (videoUrl: string) => Promise<string>;
} | null = null;

try {
  FFmpegProvider = require("../UGCProviders/FFmpegProvider").default;
} catch {
  logger.warn("[ComposeUGCVideoService] FFmpegProvider no disponible");
}

try {
  CreatomateProvider = require("../UGCProviders/CreatomateProvider").default;
} catch {
  logger.warn("[ComposeUGCVideoService] CreatomateProvider no disponible");
}

interface ComposeOptions {
  subtitles?: boolean;
  watermark?: string;
  intro?: string;
  outro?: string;
  musicTrack?: string;
}

interface ComposeUGCVideoRequest {
  companyId: number;
  videoJobId: number;
  rawVideoUrl: string;
  options: ComposeOptions;
}

interface ComposeUGCVideoResponse {
  composedVideoUrl: string;
  thumbnailUrl: string;
}

const ComposeUGCVideoService = async (
  params: ComposeUGCVideoRequest
): Promise<ComposeUGCVideoResponse> => {
  const { companyId, videoJobId, rawVideoUrl, options } = params;

  if (!rawVideoUrl) {
    throw new AppError("ERR_UGC_COMPOSE_NO_RAW_VIDEO", 400);
  }

  const job = await UGCVideoJob.findOne({
    where: { id: videoJobId, companyId }
  });

  if (!job) {
    throw new AppError("ERR_UGC_VIDEO_JOB_NOT_FOUND", 404);
  }

  const campaign = await UGCCampaign.findOne({
    where: { id: job.ugcCampaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  let composedVideoUrl = rawVideoUrl;
  let thumbnailUrl = `${rawVideoUrl.replace(/\.[^.]+$/, "")}_thumb.jpg`;
  let usedProvider = "pass_through";

  // Intentar con CreatomateProvider primero (mejor calidad)
  if (CreatomateProvider && process.env.CREATOMATE_API_KEY) {
    try {
      const result = await CreatomateProvider.compose({
        videoUrl: rawVideoUrl,
        subtitles: options.subtitles,
        watermark: options.watermark,
        intro: options.intro,
        outro: options.outro,
        musicTrack: options.musicTrack,
        companyId
      });
      composedVideoUrl = result.outputUrl as string;
      usedProvider = "creatomate";

      thumbnailUrl = await CreatomateProvider.generateThumbnail(composedVideoUrl);

      logger.info(
        `[ComposeUGCVideoService] Composicion con Creatomate exitosa: job=${videoJobId}`
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[ComposeUGCVideoService] Creatomate fallo, intentando FFmpeg: ${errMsg}`
      );
    }
  }

  // Fallback a FFmpegProvider
  if (usedProvider === "pass_through" && FFmpegProvider) {
    try {
      const result = await FFmpegProvider.compose({
        videoUrl: rawVideoUrl,
        subtitles: options.subtitles,
        watermark: options.watermark,
        intro: options.intro,
        outro: options.outro,
        musicTrack: options.musicTrack,
        companyId
      });
      composedVideoUrl = result.outputUrl as string;
      usedProvider = "ffmpeg";

      thumbnailUrl = await FFmpegProvider.generateThumbnail(composedVideoUrl);

      logger.info(
        `[ComposeUGCVideoService] Composicion con FFmpeg exitosa: job=${videoJobId}`
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[ComposeUGCVideoService] FFmpeg fallo, usando pass-through: ${errMsg}`
      );
    }
  }

  if (usedProvider === "pass_through") {
    logger.warn(
      `[ComposeUGCVideoService] Ningun compositor disponible, usando video raw: job=${videoJobId}`
    );
  }

  // Crear asset de video compuesto
  await UGCVideoAsset.create({
    companyId,
    ugcVideoJobId: videoJobId,
    ugcCampaignId: campaign.id,
    assetType: "composed_final",
    fileName: `ugc_composed_${campaign.id}_${videoJobId}.mp4`,
    localPath: composedVideoUrl,
    originalUrl: rawVideoUrl,
    fileSize: 0,
    mimeType: "video/mp4",
    duration: campaign.generationConfig?.videoDuration || 30,
    version: 1,
    isActive: true,
    downloadCount: 0,
    metadata: {
      compositorProvider: usedProvider,
      options
    }
  } as Partial<UGCVideoAsset> as UGCVideoAsset);

  // Actualizar el job
  await job.update({
    finalVideoUrl: composedVideoUrl,
    thumbnailUrl,
    compositorProvider: usedProvider
  });

  job.addLogEntry("composition", "completed", `Video compuesto con ${usedProvider}`, {
    provider: usedProvider
  });
  await job.save();

  logger.info(
    `[ComposeUGCVideoService] Composicion completada: job=${videoJobId}, ` +
    `provider=${usedProvider}, company=${companyId}`
  );

  return { composedVideoUrl, thumbnailUrl };
};

export default ComposeUGCVideoService;
