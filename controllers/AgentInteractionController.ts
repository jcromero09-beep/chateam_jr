/**
 * Controller: AgentInteractionController
 * Maneja las peticiones HTTP para interacciones de agentes UGC.
 *
 * Endpoints:
 * - GET    /ugc/interactions/inbox             - Bandeja de comentarios
 * - GET    /ugc/interactions/analytics         - Estadisticas agregadas
 * - POST   /ugc/interactions/:commentId/reply  - Responder a comentario
 * - POST   /ugc/interactions/:commentId/classify - Clasificar comentario
 * - GET    /ugc/interactions/:identityId/history - Historial de interacciones
 */

import { Request, Response } from "express";
import { Op, fn, col, literal } from "sequelize";
import ListCommentsInboxService from "../services/AgentEngagementServices/ListCommentsInboxService";
import CommentReplyOrchestratorService from "../services/AgentEngagementServices/CommentReplyOrchestratorService";
import CommentClassifierService from "../services/AgentEngagementServices/CommentClassifierService";
import UGCPostComment, { CommentType, AutoReplyStatus, CommentPlatform } from "../models/UGCPostComment";
import AgentInteraction from "../models/AgentInteraction";
import AgentIdentity from "../models/AgentIdentity";
import AgentDevice from "../models/AgentDevice";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * GET /ugc/interactions/inbox
 * Lista comentarios para la bandeja de entrada
 */
export const inbox = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    commentType,
    platform,
    autoReplyStatus,
    searchParam
  } = req.query;

  try {
    const result = await ListCommentsInboxService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      commentType: commentType as CommentType | undefined,
      platform: platform as CommentPlatform | undefined,
      autoReplyStatus: autoReplyStatus as AutoReplyStatus | undefined,
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.comments,
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
    logger.error(`[AgentInteractionController.inbox] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar comentarios"
    });
  }
};

/**
 * POST /ugc/interactions/:commentId/reply
 * Orquesta la respuesta completa a un comentario
 */
export const replyToComment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { commentId } = req.params;

  try {
    const result = await CommentReplyOrchestratorService({
      companyId,
      commentId: Number(commentId),
      userId
    });

    return res.status(200).json({
      success: true,
      message: "Respuesta generada exitosamente",
      data: result
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentInteractionController.replyToComment] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al responder comentario"
    });
  }
};

/**
 * POST /ugc/interactions/:commentId/classify
 * Clasifica un comentario usando IA
 */
export const classifyComment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { commentId } = req.params;

  try {
    const comment = await UGCPostComment.findOne({
      where: { id: Number(commentId), companyId }
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_COMMENT_NOT_FOUND"
      });
    }

    const classification = await CommentClassifierService({
      companyId,
      commentContent: comment.content,
      authorUsername: comment.authorUsername,
      postContext: req.body.postContext,
      userId
    });

    // Actualizar el comentario con la clasificacion
    await comment.classify(
      classification.commentType,
      classification.sentiment,
      classification.purchaseIntentScore,
      "gpt-5.5"
    );

    await comment.reload();

    return res.status(200).json({
      success: true,
      message: "Comentario clasificado exitosamente",
      data: {
        commentId: comment.id,
        commentType: comment.commentType,
        sentiment: comment.sentiment,
        purchaseIntentScore: comment.purchaseIntentScore,
        classifiedAt: comment.classifiedAt,
        classifiedBy: comment.classifiedBy
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
    logger.error(`[AgentInteractionController.classifyComment] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al clasificar comentario"
    });
  }
};

/**
 * GET /ugc/interactions/:identityId/history
 * Historial de interacciones de un agente
 */
export const interactionHistory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { identityId } = req.params;
  const { page = "1", limit = "20", type, platform } = req.query;

  try {
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: Record<string, unknown> = {
      companyId,
      agentIdentityId: Number(identityId)
    };

    if (type) {
      whereClause.type = type;
    }

    if (platform) {
      whereClause.platform = platform;
    }

    const { rows: interactions, count: total } = await AgentInteraction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AgentDevice,
          as: "agentDevice",
          required: false,
          attributes: ["id", "deviceId", "name", "status"]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    return res.status(200).json({
      success: true,
      data: interactions,
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
    logger.error(`[AgentInteractionController.interactionHistory] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener historial"
    });
  }
};

/**
 * GET /ugc/interactions/analytics
 * Estadisticas agregadas de interacciones
 */
export const analytics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days = "30" } = req.query;

  try {
    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    // Interacciones por tipo
    const interactionsByType = await AgentInteraction.findAll({
      where: {
        companyId,
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        "type",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["type"],
      raw: true
    });

    // Interacciones por estado
    const interactionsByStatus = await AgentInteraction.findAll({
      where: {
        companyId,
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        "executionStatus",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["executionStatus"],
      raw: true
    });

    // Comentarios por tipo
    const commentsByType = await UGCPostComment.findAll({
      where: {
        companyId,
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        "commentType",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["commentType"],
      raw: true
    });

    // Totales
    const totalInteractions = await AgentInteraction.count({
      where: { companyId, createdAt: { [Op.gte]: since } }
    });

    const totalComments = await UGCPostComment.count({
      where: { companyId, createdAt: { [Op.gte]: since } }
    });

    const totalReplied = await UGCPostComment.count({
      where: {
        companyId,
        autoReplyStatus: "sent",
        createdAt: { [Op.gte]: since }
      }
    });

    const purchaseIntents = await UGCPostComment.count({
      where: {
        companyId,
        commentType: "purchase_intent",
        createdAt: { [Op.gte]: since }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        period: {
          days: Number(days),
          since: since.toISOString()
        },
        totals: {
          interactions: totalInteractions,
          comments: totalComments,
          replied: totalReplied,
          purchaseIntents,
          replyRate: totalComments > 0
            ? Number(((totalReplied / totalComments) * 100).toFixed(1))
            : 0
        },
        interactionsByType,
        interactionsByStatus,
        commentsByType
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
    logger.error(`[AgentInteractionController.analytics] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener analytics"
    });
  }
};
