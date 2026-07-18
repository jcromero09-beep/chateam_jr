/**
 * Controller: UGCVideoController
 * Maneja las peticiones HTTP para video jobs UGC.
 *
 * Endpoints:
 * - GET    /ugc/videos              - Listar videos con paginacion
 * - GET    /ugc/videos/:id          - Detalle de un video job
 * - POST   /ugc/videos/:id/retry    - Re-encolar un video job fallido
 * - GET    /ugc/videos/:id/download - Obtener URL de descarga del asset final
 */

import { Request, Response } from "express";
import UGCVideoJob, { UGCVideoJobStatus } from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";
import UGCCampaign from "../models/UGCCampaign";
import { add } from "../queues";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * GET /ugc/videos
 * Lista video jobs con paginacion y filtros opcionales
 */
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    status,
    stage,
    campaignId
  } = req.query;

  try {
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: Record<string, unknown> = { companyId };

    if (status) {
      whereClause.status = status;
    }
    if (stage) {
      whereClause.stage = stage;
    }
    if (campaignId) {
      whereClause.ugcCampaignId = Number(campaignId);
    }

    const { rows: videos, count: total } = await UGCVideoJob.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UGCVideoAsset,
          as: "assets",
          attributes: ["id", "assetType", "fileName", "localPath", "originalUrl", "mimeType", "isActive"],
          required: false,
          where: { isActive: true }
        },
        {
          model: UGCCampaign,
          as: "ugcCampaign",
          attributes: ["id", "name", "generationConfig"],
          required: false
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    return res.status(200).json({
      success: true,
      data: videos,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCVideoController.list] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar video jobs UGC"
    });
  }
};

/**
 * GET /ugc/videos/:id
 * Obtiene el detalle completo de un video job con todos sus assets
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const videoJob = await UGCVideoJob.findOne({
      where: { id: Number(id), companyId },
      include: [
        {
          model: UGCVideoAsset,
          as: "assets",
          required: false
        },
        {
          model: UGCCampaign,
          as: "ugcCampaign",
          attributes: ["id", "name", "generationConfig"],
          required: false
        }
      ]
    });

    if (!videoJob) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_VIDEO_JOB_NOT_FOUND"
      });
    }

    return res.status(200).json({
      success: true,
      data: videoJob
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCVideoController.show] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener video job UGC"
    });
  }
};

/**
 * POST /ugc/videos/:id/retry
 * Re-encola un video job fallido para procesamiento
 */
export const retry = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const videoJob = await UGCVideoJob.findOne({
      where: { id: Number(id), companyId },
      include: [
        {
          model: UGCCampaign,
          as: "ugcCampaign",
          attributes: ["id", "generationConfig"],
          required: false
        }
      ]
    });

    if (!videoJob) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_VIDEO_JOB_NOT_FOUND"
      });
    }

    // Solo se puede reintentar desde failed
    if (videoJob.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: "ERR_UGC_VIDEO_JOB_NOT_FAILED"
      });
    }

    // Resetear el job para reintento
    const previousStage = videoJob.stage;
    const retryStage = previousStage === "failed" ? "script_generation" : previousStage;

    await videoJob.update({
      status: "pending",
      stage: retryStage,
      errorMessage: null,
      videoProviderJobId: null,
      rawVideoUrl: null,
      finalVideoUrl: null,
      retryCount: videoJob.retryCount + 1,
      metadata: {
        ...videoJob.metadata,
        lastRetryAt: new Date().toISOString(),
        retriedFromStage: previousStage
      }
    });

    videoJob.addLogEntry(retryStage, "pending", `Reintento #${videoJob.retryCount} iniciado`, {
      provider: "manual_retry"
    });
    await videoJob.save();

    // Encolar nuevamente
    try {
      const campaign = videoJob.get("ugcCampaign") as UGCCampaign | undefined;
      const generationConfig = campaign?.generationConfig || {};
      const provider = String(
        videoJob.videoProvider ||
        generationConfig.videoProvider ||
        process.env.UGC_VIDEO_PROVIDER ||
        ""
      );
      const queueName = provider.startsWith("fal")
        ? "UGCVideoGenerationQueue"
        : "UGCVideoPipelineQueue";
      const referenceImageUrl =
        typeof videoJob.metadata?.referenceImageUrl === "string" &&
        /^https?:\/\//i.test(videoJob.metadata.referenceImageUrl)
          ? videoJob.metadata.referenceImageUrl
          : null;

      await add(queueName, {
        companyId,
        campaignId: videoJob.ugcCampaignId,
        videoJobId: videoJob.id,
        isRetry: true,
        retryCount: videoJob.retryCount,
        ...(referenceImageUrl ? { characterImageUrl: referenceImageUrl } : {})
      });

      logger.info(
        `[UGCVideoController.retry] Reintento enviado a ${queueName}: ` +
        `videoJob=${videoJob.id}, provider=${provider || "default"}`
      );
    } catch (queueErr: unknown) {
      const errMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
      logger.warn(
        `[UGCVideoController.retry] Error encolando reintento: ${errMsg}`
      );
    }

    logger.info(
      `[UGCVideoController.retry] Video job re-encolado: id=${videoJob.id}, ` +
      `stage=${retryStage}, retryCount=${videoJob.retryCount}, company=${companyId}`
    );

    return res.status(200).json({
      success: true,
      message: `Video job re-encolado para reintento (intento #${videoJob.retryCount})`,
      data: {
        id: videoJob.id,
        stage: retryStage,
        status: "pending",
        retryCount: videoJob.retryCount
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCVideoController.retry] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al reintentar video job UGC"
    });
  }
};

/**
 * GET /ugc/videos/:id/download
 * Retorna la URL del asset final del video job
 */
export const download = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const videoJob = await UGCVideoJob.findOne({
      where: { id: Number(id), companyId }
    });

    if (!videoJob) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_VIDEO_JOB_NOT_FOUND"
      });
    }

    // Buscar el asset compuesto final mas reciente
    const finalAsset = await UGCVideoAsset.findOne({
      where: {
        ugcVideoJobId: videoJob.id,
        companyId,
        assetType: "composed_final",
        isActive: true
      },
      order: [["version", "DESC"]]
    });

    if (!finalAsset) {
      // Fallback al finalVideoUrl del job
      if (videoJob.finalVideoUrl) {
        return res.status(200).json({
          success: true,
          data: {
            downloadUrl: videoJob.finalVideoUrl,
            fileName: videoJob.fileName || `ugc_video_${videoJob.id}.mp4`,
            mimeType: videoJob.mimeType,
            source: "job_url"
          }
        });
      }

      return res.status(404).json({
        success: false,
        message: "ERR_UGC_VIDEO_ASSET_NOT_FOUND"
      });
    }

    // Incrementar conteo de descargas
    await finalAsset.incrementDownloads();

    return res.status(200).json({
      success: true,
      data: {
        downloadUrl: finalAsset.localPath,
        originalUrl: finalAsset.originalUrl,
        fileName: finalAsset.fileName,
        mimeType: finalAsset.mimeType,
        fileSize: finalAsset.fileSize,
        duration: finalAsset.duration,
        version: finalAsset.version,
        source: "asset"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCVideoController.download] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener descarga de video UGC"
    });
  }
};
