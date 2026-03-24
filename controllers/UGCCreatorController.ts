/**
 * Controller: UGCCreatorController
 * Maneja las peticiones HTTP para la red de creadores UGC.
 *
 * Endpoints:
 * - POST   /ugc/creators                        - Crear creador
 * - GET    /ugc/creators                         - Listar creadores
 * - GET    /ugc/creators/:id                     - Detalle de creador
 * - PUT    /ugc/creators/:id                     - Actualizar creador
 * - POST   /ugc/creators/:id/assign/:campaignId  - Asignar a campana
 * - GET    /ugc/creators/:id/assignments          - Listar asignaciones
 * - POST   /ugc/creators/:id/pay                 - Procesar pago
 * - GET    /ugc/creators/:id/payments             - Listar pagos
 * - DELETE /ugc/creators/:id                     - Archivar creador
 */

import { Request, Response } from "express";
import CreateCreatorService from "../services/UGCCreatorServices/CreateCreatorService";
import ListCreatorsService from "../services/UGCCreatorServices/ListCreatorsService";
import AssignCreatorService from "../services/UGCCreatorServices/AssignCreatorService";
import ProcessCreatorPaymentService from "../services/UGCCreatorServices/ProcessCreatorPaymentService";
import UGCCreator, { CreatorStatus } from "../models/UGCCreator";
import UGCCreatorAssignment from "../models/UGCCreatorAssignment";
import UGCCreatorPayment from "../models/UGCCreatorPayment";
import UGCCampaign from "../models/UGCCampaign";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * POST /ugc/creators
 * Crea un nuevo creador de contenido
 */
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    email,
    phone,
    niche,
    platforms,
    baseRate,
    currency,
    paymentMethod,
    portfolio,
    tags
  } = req.body;

  try {
    const result = await CreateCreatorService({
      companyId,
      name,
      email,
      phone,
      niche,
      platforms: platforms || [],
      baseRate: Number(baseRate) || 0,
      currency,
      paymentMethod: paymentMethod || "stripe",
      portfolio,
      tags
    });

    return res.status(201).json({
      success: true,
      message: "Creador registrado exitosamente",
      data: result.creator
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.create] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al crear creador"
    });
  }
};

/**
 * GET /ugc/creators
 * Lista creadores con paginacion y filtros
 */
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    status,
    niche,
    searchParam
  } = req.query;

  try {
    const result = await ListCreatorsService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      status: status as CreatorStatus | undefined,
      niche: niche as string | undefined,
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.creators,
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
    logger.error(`[UGCCreatorController.list] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar creadores"
    });
  }
};

/**
 * GET /ugc/creators/:id
 * Obtiene detalle de un creador con relaciones
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const creator = await UGCCreator.findOne({
      where: { id: Number(id), companyId },
      include: [
        {
          model: UGCCreatorAssignment,
          as: "assignments",
          required: false,
          include: [
            {
              model: UGCCampaign,
              as: "campaign",
              required: false,
              attributes: ["id", "name", "status"]
            }
          ]
        }
      ]
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_CREATOR_NOT_FOUND"
      });
    }

    return res.status(200).json({
      success: true,
      data: creator
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.show] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener creador"
    });
  }
};

/**
 * PUT /ugc/creators/:id
 * Actualiza campos editables del creador
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    name,
    phone,
    niche,
    platforms,
    baseRate,
    currency,
    paymentMethod,
    portfolio,
    tags,
    bio,
    profileImageUrl,
    status: newStatus
  } = req.body;

  try {
    const creator = await UGCCreator.findOne({
      where: { id: Number(id), companyId }
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_CREATOR_NOT_FOUND"
      });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (niche !== undefined) updateData.niche = niche;
    if (platforms !== undefined) updateData.platforms = platforms;
    if (baseRate !== undefined) updateData.baseRate = Number(baseRate);
    if (currency !== undefined) updateData.currency = currency;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (portfolio !== undefined) updateData.portfolio = portfolio;
    if (tags !== undefined) updateData.tags = tags;
    if (bio !== undefined) updateData.bio = bio;
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;
    if (newStatus !== undefined) updateData.status = newStatus;

    await creator.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Creador actualizado exitosamente",
      data: creator
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.update] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar creador"
    });
  }
};

/**
 * POST /ugc/creators/:id/assign/:campaignId
 * Asigna un creador a una campana
 */
export const assignToCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id, campaignId } = req.params;
  const { brief, requirements, deadline, agreedRate } = req.body;

  try {
    const result = await AssignCreatorService({
      companyId,
      creatorId: Number(id),
      campaignId: Number(campaignId),
      brief,
      requirements,
      deadline: new Date(deadline),
      agreedRate: Number(agreedRate)
    });

    return res.status(201).json({
      success: true,
      message: "Creador asignado exitosamente a la campana",
      data: result.assignment
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.assignToCampaign] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al asignar creador"
    });
  }
};

/**
 * GET /ugc/creators/:id/assignments
 * Lista asignaciones de un creador
 */
export const listAssignments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { page = "1", limit = "20", status } = req.query;

  try {
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: Record<string, unknown> = {
      creatorId: Number(id),
      companyId
    };

    if (status) {
      whereClause.status = status;
    }

    const { rows: assignments, count: total } = await UGCCreatorAssignment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UGCCampaign,
          as: "campaign",
          required: false,
          attributes: ["id", "name", "status"]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    return res.status(200).json({
      success: true,
      data: assignments,
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
    logger.error(`[UGCCreatorController.listAssignments] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar asignaciones"
    });
  }
};

/**
 * POST /ugc/creators/:id/pay
 * Procesa un pago a un creador
 */
export const processPayment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { assignmentId, amount, currency, description } = req.body;

  try {
    const result = await ProcessCreatorPaymentService({
      companyId,
      creatorId: Number(id),
      assignmentId: assignmentId ? Number(assignmentId) : undefined,
      amount: Number(amount),
      currency,
      description
    });

    return res.status(201).json({
      success: true,
      message: "Pago procesado exitosamente",
      data: result.payment
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.processPayment] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al procesar pago"
    });
  }
};

/**
 * GET /ugc/creators/:id/payments
 * Lista pagos de un creador
 */
export const listPayments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { page = "1", limit = "20", status } = req.query;

  try {
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: Record<string, unknown> = {
      creatorId: Number(id),
      companyId
    };

    if (status) {
      whereClause.status = status;
    }

    const { rows: payments, count: total } = await UGCCreatorPayment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UGCCreatorAssignment,
          as: "assignment",
          required: false,
          attributes: ["id", "campaignId", "status", "agreedRate"]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    return res.status(200).json({
      success: true,
      data: payments,
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
    logger.error(`[UGCCreatorController.listPayments] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar pagos"
    });
  }
};

/**
 * DELETE /ugc/creators/:id
 * Soft delete: cambia status a 'archived'
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const creator = await UGCCreator.findOne({
      where: { id: Number(id), companyId }
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_CREATOR_NOT_FOUND"
      });
    }

    await creator.archive();

    return res.status(200).json({
      success: true,
      message: "Creador archivado exitosamente",
      data: { id: creator.id, status: creator.status }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCCreatorController.remove] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al archivar creador"
    });
  }
};
