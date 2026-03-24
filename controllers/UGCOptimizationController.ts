/**
 * Controller: UGCOptimizationController
 * Maneja las peticiones HTTP para el sistema de optimizacion de campanas UGC.
 *
 * Endpoints:
 * - POST   /ugc/optimization/:campaignId/run              - Ejecuta feedback loop
 * - POST   /ugc/optimization/:campaignId/optimize-budget   - Optimiza presupuesto
 * - POST   /ugc/optimization/:campaignId/extract-learnings - Extrae learnings
 * - GET    /ugc/optimization/history                       - Historial de learnings
 * - GET    /ugc/optimization/learnings                     - Lista learnings con filtros
 * - GET    /ugc/optimization/:campaignId/metrics           - Metricas de campana
 */

import { Request, Response } from "express";
import FeedbackLoopService from "../services/UGCOptimizationServices/FeedbackLoopService";
import BudgetOptimizationService from "../services/UGCOptimizationServices/BudgetOptimizationService";
import LearningExtractionService from "../services/UGCOptimizationServices/LearningExtractionService";
import ListOptimizationHistoryService from "../services/UGCOptimizationServices/ListOptimizationHistoryService";
import UGCCampaignMetric from "../models/UGCCampaignMetric";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { LearningType, LearningImpact } from "../models/UGCCreativeLearning";

/**
 * POST /ugc/optimization/:campaignId/run
 * Ejecuta el feedback loop autonomo para una campana
 */
export const runFeedbackLoop = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignId } = req.params;

  try {
    const result = await FeedbackLoopService({
      companyId,
      campaignId: Number(campaignId)
    });

    return res.status(200).json({
      success: true,
      message: "Feedback loop ejecutado exitosamente",
      data: {
        metricsSnapshot: result.metricsSnapshot,
        learnings: result.learnings,
        autoApplied: result.autoApplied,
        learningsCount: result.learnings.length
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
    logger.error(`[UGCOptimizationController.runFeedbackLoop] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al ejecutar feedback loop"
    });
  }
};

/**
 * POST /ugc/optimization/:campaignId/optimize-budget
 * Optimiza presupuesto de la campana
 */
export const optimizeBudget = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignId } = req.params;

  try {
    const result = await BudgetOptimizationService({
      companyId,
      campaignId: Number(campaignId)
    });

    return res.status(200).json({
      success: true,
      message: "Optimizacion de presupuesto completada",
      data: {
        recommendations: result.recommendations,
        budgetAllocation: result.budgetAllocation,
        abTestResults: result.abTestResults
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
    logger.error(`[UGCOptimizationController.optimizeBudget] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al optimizar presupuesto"
    });
  }
};

/**
 * POST /ugc/optimization/:campaignId/extract-learnings
 * Extrae learnings de metricas historicas
 */
export const extractLearnings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignId } = req.params;

  try {
    const result = await LearningExtractionService({
      companyId,
      campaignId: Number(campaignId) || undefined
    });

    return res.status(200).json({
      success: true,
      message: `${result.learnings.length} learnings extraidos`,
      data: {
        learnings: result.learnings,
        count: result.learnings.length
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
    logger.error(`[UGCOptimizationController.extractLearnings] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al extraer learnings"
    });
  }
};

/**
 * GET /ugc/optimization/history
 * Lista historial completo de optimizaciones
 */
export const listHistory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    campaignId,
    learningType,
    impact
  } = req.query;

  try {
    const result = await ListOptimizationHistoryService({
      companyId,
      campaignId: campaignId ? Number(campaignId) : undefined,
      page: Number(page),
      limit: Number(limit),
      learningType: learningType as LearningType | undefined,
      impact: impact as LearningImpact | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.learnings,
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
    logger.error(`[UGCOptimizationController.listHistory] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar historial"
    });
  }
};

/**
 * GET /ugc/optimization/learnings
 * Lista learnings con filtros especificos
 */
export const listLearnings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    campaignId,
    learningType,
    impact
  } = req.query;

  try {
    const result = await ListOptimizationHistoryService({
      companyId,
      campaignId: campaignId ? Number(campaignId) : undefined,
      page: Number(page),
      limit: Number(limit),
      learningType: learningType as LearningType | undefined,
      impact: impact as LearningImpact | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.learnings,
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
    logger.error(`[UGCOptimizationController.listLearnings] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar learnings"
    });
  }
};

/**
 * GET /ugc/optimization/:campaignId/metrics
 * Lista metricas de una campana especifica
 */
export const listMetrics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignId } = req.params;
  const { page = "1", limit = "50" } = req.query;

  try {
    const offset = (Number(page) - 1) * Number(limit);

    const { rows: metrics, count: total } = await UGCCampaignMetric.findAndCountAll({
      where: {
        campaignId: Number(campaignId),
        companyId
      },
      order: [["snapshotAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    return res.status(200).json({
      success: true,
      data: metrics,
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
    logger.error(`[UGCOptimizationController.listMetrics] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar metricas"
    });
  }
};
