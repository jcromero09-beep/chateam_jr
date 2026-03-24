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
import CreateUGCCampaignService from "../services/UGCCampaignServices/CreateUGCCampaignService";
import ListUGCCampaignsService from "../services/UGCCampaignServices/ListUGCCampaignsService";
import ShowUGCCampaignService from "../services/UGCCampaignServices/ShowUGCCampaignService";
import LaunchUGCCampaignService from "../services/UGCCampaignServices/LaunchUGCCampaignService";
import PauseUGCCampaignService from "../services/UGCCampaignServices/PauseUGCCampaignService";
import UGCCampaign, { UGCCampaignStatus } from "../models/UGCCampaign";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * POST /ugc/campaigns
 * Crea una nueva campana UGC en estado draft
 */
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const {
    name,
    productBrief,
    generationConfig,
    publishConfig,
    optimizationConfig,
    budget
  } = req.body;

  try {
    const campaign = await CreateUGCCampaignService({
      companyId,
      userId,
      name,
      productBrief,
      generationConfig,
      publishConfig,
      optimizationConfig,
      budget
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
