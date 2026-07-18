/**
 * Controller: UGCCampaignController
 * Maneja las peticiones HTTP para campanas UGC.
 *
 * Endpoints:
 * - POST   /ugc/campaigns              - Crear campana
 * - GET    /ugc/campaigns              - Listar campanas
 * - GET    /ugc/campaigns/:id          - Detalle de campana
 * - PUT    /ugc/campaigns/:id          - Actualizar campana
 * - POST   /ugc/campaigns/:id/launch   - Lanzar campana
 * - POST   /ugc/campaigns/:id/pause    - Pausar campana
 * - GET    /ugc/campaigns/:id/videos   - Listar videos de campana
 */

import { Request, Response } from "express";
import path from "path";
import { Op } from "sequelize";
import uploadConfig from "../config/upload";
import CreateUGCCampaignService from "../services/UGCCampaignServices/CreateUGCCampaignService";
import ListUGCCampaignsService from "../services/UGCCampaignServices/ListUGCCampaignsService";
import ShowUGCCampaignService from "../services/UGCCampaignServices/ShowUGCCampaignService";
import LaunchUGCCampaignService from "../services/UGCCampaignServices/LaunchUGCCampaignService";
import PauseUGCCampaignService from "../services/UGCCampaignServices/PauseUGCCampaignService";
import UpdateModelSelectionService, {
  ValidationAppError
} from "../services/UGCCampaignServices/UpdateModelSelectionService";
import {
  FAL_MODEL_CATALOG,
  FAL_CATALOG_VERSION,
  resolveCatalogModelId
} from "../services/UGCProviders/fal/catalog";
import UGCCampaign, { UGCCampaignStatus } from "../models/UGCCampaign";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";
import AgentIdentity from "../models/AgentIdentity";
import AgentInteraction from "../models/AgentInteraction";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

const safeCount = async (
  label: string,
  counter: () => Promise<number>
): Promise<number> => {
  try {
    return await counter();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[UGCCampaignController.dashboard] ${label} count skipped: ${message}`);
    return 0;
  }
};

const safeFindAll = async <T>(
  label: string,
  finder: () => Promise<T[]>
): Promise<T[]> => {
  try {
    return await finder();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[UGCCampaignController.dashboard] ${label} list skipped: ${message}`);
    return [];
  }
};

const absoluteBackendUrl = (req: Request): string => {
  const configured = process.env.BACKEND_URL || "";
  const base = configured || `${req.protocol}://${req.get("host")}`;
  return base.replace(/\/+$/, "");
};

/**
 * POST /ugc/assets/reference
 * Sube una imagen de referencia para modelos text+image -> video.
 */
export const uploadReference = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "ERR_UGC_REFERENCE_FILE_REQUIRED"
    });
  }

  const relativePath = path
    .relative(uploadConfig.directory, file.path)
    .split(path.sep)
    .join("/");
  const url = `${absoluteBackendUrl(req)}/public/${relativePath}`;

  return res.status(201).json({
    success: true,
    data: {
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    }
  });
};

/**
 * POST /ugc/campaigns
 * Crea una nueva campana UGC en estado draft
 */
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const {
    name,
    brief,
    product,
    tone,
    targetAudience,
    callToAction,
    videoProvider,
    videoFormat,
    videoDuration,
    videoResolution,
    videosCount,
    imagesCount,
    videoLanguage,
    platforms,
    autoPublish,
    abTesting,
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
  } = req.body;

  try {
    const campaign = await CreateUGCCampaignService({
      companyId,
      userId,
      name,
      productBrief: productBrief || {
        productName: product,
        targetAudience,
        tone,
        callToAction,
        keyFeatures: brief ? [brief] : []
      },
      generationConfig: generationConfig || {
        videoCount: Number(videosCount || 3),
        imageCount: Number(imagesCount || 2),
        videoDuration: Number(videoDuration || 30),
        videoResolution: videoResolution || "720p",
        aspectRatio: videoFormat || "9:16",
        videoProvider: videoProvider || process.env.UGC_VIDEO_PROVIDER || "fal-wan",
        imageProvider: process.env.UGC_IMAGE_PROVIDER || "fal-flux",
        language: videoLanguage || "es",
        subtitlesEnabled: true,
        hooks: []
      },
      publishConfig: publishConfig || {
        platforms: platforms || [],
        autoPublish: Boolean(autoPublish)
      },
      optimizationConfig: optimizationConfig || {
        abTestEnabled: Boolean(abTesting)
      },
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
    });

    return res.status(201).json({
      success: true,
      message: "Campana UGC creada exitosamente",
      data: campaign
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCampaignController.create] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al crear campana UGC"
    });
  }
};

/**
 * GET /ugc/campaigns
 * Lista campanas UGC con paginacion y filtros
 */
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    status,
    searchParam
  } = req.query;

  try {
    const result = await ListUGCCampaignsService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      status: status as UGCCampaignStatus | undefined,
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.campaigns,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
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
    logger.error(`[UGCCampaignController.list] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar campanas UGC"
    });
  }
};

/**
 * GET /ugc/dashboard
 * Resumen agregado del pipeline UGC para evitar derivar contadores desde listas paginadas.
 */
export const dashboard = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const [
    totalIdentities,
    totalCampaigns,
    activeCampaigns,
    totalVideos,
    completedVideos,
    generatedImages,
    totalInteractions,
    recentIdentities,
    recentCampaigns
  ] = await Promise.all([
    safeCount("identities", () => AgentIdentity.count({ where: { companyId } })),
    safeCount("campaigns", () => UGCCampaign.count({ where: { companyId } })),
    safeCount("active campaigns", () => UGCCampaign.count({
      where: {
        companyId,
        status: { [Op.in]: ["active", "producing", "review", "publishing", "optimizing"] }
      }
    })),
    safeCount("videos", () => UGCVideoJob.count({ where: { companyId } })),
    safeCount("completed videos", () => UGCVideoJob.count({ where: { companyId, status: "completed" } })),
    safeCount("generated images", () => UGCVideoAsset.count({
      where: {
        companyId,
        assetType: { [Op.in]: ["generated_image", "image_thumbnail"] },
        isActive: true
      }
    })),
    safeCount("interactions", () => AgentInteraction.count({ where: { companyId } })),
    safeFindAll("recent identities", () => AgentIdentity.findAll({
      where: { companyId },
      order: [["createdAt", "DESC"]],
      limit: 5
    })),
    safeFindAll("recent campaigns", () => UGCCampaign.findAll({
      where: { companyId },
      order: [["createdAt", "DESC"]],
      limit: 5
    }))
  ]);

  return res.status(200).json({
    success: true,
    data: {
      stats: {
        totalIdentities,
        totalCampaigns,
        activeCampaigns,
        totalVideos,
        videosGenerated: totalVideos,
        completedVideos,
        generatedImages,
        totalInteractions
      },
      identities: recentIdentities,
      campaigns: recentCampaigns
    }
  });
};

/**
 * GET /ugc/campaigns/:id
 * Obtiene el detalle completo de una campana
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const result = await ShowUGCCampaignService({
      companyId,
      campaignId: Number(id)
    });

    return res.status(200).json({
      success: true,
      data: {
        campaign: result.campaign,
        metrics: result.metrics,
        learnings: result.learnings
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
    logger.error(`[UGCCampaignController.show] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener campana UGC"
    });
  }
};

/**
 * PUT /ugc/campaigns/:id
 * Actualiza campos editables de una campana
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    name,
    description,
    productBrief,
    generationConfig,
    publishConfig,
    optimizationConfig,
    budget
  } = req.body;

  try {
    const campaign = await UGCCampaign.findOne({
      where: { id: Number(id), companyId }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_CAMPAIGN_NOT_FOUND"
      });
    }

    // Construir campos a actualizar
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (productBrief !== undefined) updateData.productBrief = productBrief;
    if (generationConfig !== undefined) updateData.generationConfig = generationConfig;
    if (publishConfig !== undefined) updateData.publishConfig = publishConfig;
    if (optimizationConfig !== undefined) updateData.optimizationConfig = optimizationConfig;
    if (budget !== undefined) updateData.budget = budget;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron campos para actualizar"
      });
    }

    await campaign.update(updateData);
    await campaign.reload();

    return res.status(200).json({
      success: true,
      message: "Campana actualizada exitosamente",
      data: campaign
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCampaignController.update] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar campana UGC"
    });
  }
};

/**
 * POST /ugc/campaigns/:id/launch
 * Lanza una campana (draft/paused -> producing)
 */
export const launch = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const result = await LaunchUGCCampaignService({
      companyId,
      campaignId: Number(id)
    });

    return res.status(200).json({
      success: true,
      message: `Campana lanzada: ${result.jobsEnqueued} videos en cola de generacion`,
      data: {
        campaign: result.campaign,
        jobsEnqueued: result.jobsEnqueued
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
    logger.error(`[UGCCampaignController.launch] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al lanzar campana UGC"
    });
  }
};

/**
 * POST /ugc/campaigns/:id/pause
 * Pausa una campana activa
 */
export const pause = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await PauseUGCCampaignService({
      companyId,
      campaignId: Number(id)
    });

    return res.status(200).json({
      success: true,
      message: "Campana pausada exitosamente",
      data: campaign
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCampaignController.pause] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al pausar campana UGC"
    });
  }
};

/**
 * GET /ugc/campaigns/:id/videos
 * Lista los video jobs de una campana con paginacion
 */
export const listVideos = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    page = "1",
    limit = "20",
    status,
    stage
  } = req.query;

  try {
    // Verificar que la campana existe y pertenece a la company
    const campaign = await UGCCampaign.findOne({
      where: { id: Number(id), companyId }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_CAMPAIGN_NOT_FOUND"
      });
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: Record<string, unknown> = {
      ugcCampaignId: Number(id),
      companyId
    };

    if (status) {
      whereClause.status = status;
    }
    if (stage) {
      whereClause.stage = stage;
    }

    const { rows: videos, count: total } = await UGCVideoJob.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UGCVideoAsset,
          as: "assets",
          required: false,
          where: { isActive: true }
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
    logger.error(`[UGCCampaignController.listVideos] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar videos de campana"
    });
  }
};

/**
 * GET /ugc/fal-models
 * Devuelve el catálogo curado de modelos fal.ai disponibles.
 * No consume API de fal — el catálogo es estático.
 */
export const listFalModels = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    // Resolvemos el modelId final (incluyendo env overrides) para
    // que el frontend muestre exactamente lo que se invocará en runtime.
    const models = FAL_MODEL_CATALOG.map(entry => ({
      ...entry,
      modelId: resolveCatalogModelId(entry)
    }));

    return res.status(200).json({
      success: true,
      message: "Catálogo de modelos fal.ai disponibles",
      data: {
        version: FAL_CATALOG_VERSION,
        models
      },
      errors: null
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCampaignController.listFalModels] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al cargar catálogo fal.ai"
    });
  }
};

/**
 * PATCH /ugc/campaigns/:id/model-selection
 * Guarda la selección de modelo (video + image edit) para una campaña.
 *
 * Body (todos los campos opcionales — PATCH semantics):
 *   - videoModelKey, videoModelDefaults, videoModelMotionReferenceUrl
 *   - imageModelKey, imageModelDefaults
 *
 * Responde:
 *   200 → campaña actualizada
 *   404 → campaña no existe
 *   422 → validación Zod o assets requeridos faltantes (motion-control)
 */
export const updateModelSelection = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const campaignId = Number(req.params.id);

  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de campaña inválido"
    });
  }

  try {
    // El service detecta por el shape del body si es PR #1 (flat) o
    // PR #2 (pipeline con slots) y aplica las validaciones correctas.
    const campaign = await UpdateModelSelectionService({
      campaignId,
      companyId,
      userId,
      body: req.body ?? {}
    });

    return res.status(200).json({
      success: true,
      message: "Selección de modelo actualizada",
      data: campaign,
      errors: null
    });
  } catch (error: unknown) {
    if (error instanceof ValidationAppError) {
      logger.warn(
        `[UGCCampaignController.updateModelSelection] 422 campaign=${campaignId} ` +
          `issues=${error.issues.length}`
      );
      return res.status(422).json({
        success: false,
        message: error.message,
        data: null,
        errors: error.issues
      });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[UGCCampaignController.updateModelSelection] Error: ${errorMessage}`
    );
    return res.status(500).json({
      success: false,
      message: "Error interno al guardar selección de modelo"
    });
  }
};
