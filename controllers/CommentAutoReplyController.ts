/**
 * CommentAutoReplyController — CRUD de campanas de auto-respuesta a comentarios
 * 18 funciones: dashboard, CRUD campaigns, posts discovery, logs, manual actions, testing.
 * Multi-tenant: todas las queries filtran por companyId.
 */

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { logError } from "../utils/logger";

// ─── Helper: extrae message y statusCode de errores (AppError o Error) ───
const extractError = (error: unknown): { msg: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { msg: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    const msg = error.message;
    const statusCode = msg.includes("NOT_FOUND") ? 404 : msg.includes("ERR_") ? 400 : 500;
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

// ─── Imports de servicios ────────────────────────────────────────────────
import * as CampaignCRUDService from "../services/CommentAutoReplyServices/CampaignCRUDService";
import * as PostDiscoveryService from "../services/CommentAutoReplyServices/PostDiscoveryService";
import * as ReplyLogService from "../services/CommentAutoReplyServices/ReplyLogService";
import * as CommentReplyExecutor from "../services/CommentAutoReplyServices/CommentReplyExecutor";
import * as KeywordMatcherService from "../services/CommentAutoReplyServices/KeywordMatcherService";

// ─── 1. Dashboard ────────────────────────────────────────────────────────

export const dashboard = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const result = await CampaignCRUDService.getDashboardStats(companyId);
    return res.json({ success: true, message: "Dashboard obtenido", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] dashboard error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 2. Listar campanas ──────────────────────────────────────────────────

export const listCampaigns = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as string | undefined;
    const platform = req.query.platform as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await CampaignCRUDService.listCampaigns(companyId, {
      page,
      limit,
      status,
      platform,
      search
    });

    return res.json({ success: true, message: "Campanas listadas", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] listCampaigns error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 3. Mostrar campana ──────────────────────────────────────────────────

export const showCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const result = await CampaignCRUDService.showCampaign(companyId, Number(id));
    return res.json({ success: true, message: "Campana obtenida", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] showCampaign error", { error: msg, id: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 4. Crear campana ────────────────────────────────────────────────────

export const createCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const result = await CampaignCRUDService.createCampaign(companyId, req.body);
    return res.status(201).json({ success: true, message: "Campana creada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] createCampaign error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 5. Actualizar campana ───────────────────────────────────────────────

export const updateCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const result = await CampaignCRUDService.updateCampaign(companyId, Number(id), req.body);
    return res.json({ success: true, message: "Campana actualizada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] updateCampaign error", { error: msg, id: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 6. Eliminar campana (soft delete) ───────────────────────────────────

export const deleteCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    await CampaignCRUDService.softDeleteCampaign(companyId, Number(id));
    return res.json({ success: true, message: "Campana eliminada" });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] deleteCampaign error", { error: msg, id: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 7. Activar campana ──────────────────────────────────────────────────

export const activateCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const result = await CampaignCRUDService.activateCampaign(companyId, Number(id));
    return res.json({ success: true, message: "Campana activada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] activateCampaign error", { error: msg, id: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 8. Pausar campana ───────────────────────────────────────────────────

export const pauseCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const result = await CampaignCRUDService.pauseCampaign(companyId, Number(id));
    return res.json({ success: true, message: "Campana pausada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] pauseCampaign error", { error: msg, id: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 9. Listar posts de una pagina ──────────────────────────────────────

export const listPagePosts = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { pageId } = req.params;
    const pageAccessToken = req.query.pageAccessToken as string | undefined;

    const result = await (PostDiscoveryService as any).getPagePosts(pageId, pageAccessToken || '', 25);

    return res.json({ success: true, message: "Posts obtenidos", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] listPagePosts error", { error: msg, pageId: req.params.pageId });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 10. Listar logs de campana ──────────────────────────────────────────

export const listLogs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;

    const result = await ReplyLogService.listLogs(companyId, Number(id), { page, limit });
    return res.json({ success: true, message: "Logs obtenidos", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] listLogs error", { error: msg, campaignId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 11. Estadisticas de campana ─────────────────────────────────────────

export const getCampaignStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const result = await ReplyLogService.getCampaignStats(companyId, Number(id));
    return res.json({ success: true, message: "Estadisticas obtenidas", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] getCampaignStats error", { error: msg, campaignId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 12. Responder manualmente a un comentario ──────────────────────────

export const replyToComment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentId } = req.params;
    const { message, pageAccessToken } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "El mensaje es requerido" });
    }

    const result = await (CommentReplyExecutor as any).replyToComment(commentId, message.trim(), pageAccessToken || '');

    return res.json({ success: true, message: "Respuesta enviada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] replyToComment error", { error: msg, commentId: req.params.commentId });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 13. Ocultar comentario ──────────────────────────────────────────────

export const hideComment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentId } = req.params;
    const { pageAccessToken } = req.body;

    const result = await (CommentReplyExecutor as any).hideComment(commentId, pageAccessToken || '');
    return res.json({ success: true, message: "Comentario ocultado", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] hideComment error", { error: msg, commentId: req.params.commentId });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 14. Eliminar comentario ─────────────────────────────────────────────

export const deleteComment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentId } = req.params;
    const { pageAccessToken } = req.body;

    const result = await (CommentReplyExecutor as any).deleteComment(commentId, pageAccessToken || '');
    return res.json({ success: true, message: "Comentario eliminado", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] deleteComment error", { error: msg, commentId: req.params.commentId });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 15. Bloquear usuario que comenta ────────────────────────────────────

export const blockCommenter = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentId } = req.params;
    const { commenterId, pageId, pageAccessToken } = req.body;

    if (!commenterId || !pageId) {
      return res.status(400).json({
        success: false,
        message: "commenterId y pageId son requeridos"
      });
    }

    const result = await (CommentReplyExecutor as any).blockCommenter(pageId, commenterId, pageAccessToken || '');

    return res.json({ success: true, message: "Usuario bloqueado", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] blockCommenter error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 16. Probar coincidencia de keywords ─────────────────────────────────

export const testKeywordMatch = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { commentText, keywordRules, matchingType } = req.body;

    if (!commentText || !keywordRules) {
      return res.status(400).json({
        success: false,
        message: "commentText y keywordRules son requeridos"
      });
    }

    const result = KeywordMatcherService.matchKeywords(
      commentText,
      keywordRules,
      matchingType || "contains"
    );
    return res.json({
      success: true,
      message: "Test ejecutado",
      data: {
        matched: result !== null,
        matchedRule: result,
      }
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] testKeywordMatch error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 17. Probar respuesta (simulacion sin enviar) ────────────────────────

export const testReply = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentText, keywordRules, matchingType, replyTemplates, replyMode } = req.body;

    if (!commentText) {
      return res.status(400).json({
        success: false,
        message: "commentText es requerido"
      });
    }

    // Paso 1: Evaluar keywords
    const matchResult: any = keywordRules
      ? KeywordMatcherService.matchKeywords(commentText, keywordRules, matchingType)
      : { matched: true, matchedKeywords: [], rule: null };

    // Paso 2: Simular seleccion de respuesta
    let selectedReply: string | null = null;
    if (matchResult.matched && replyTemplates && replyTemplates.length > 0) {
      if (replyMode === "random") {
        selectedReply = replyTemplates[Math.floor(Math.random() * replyTemplates.length)];
      } else {
        selectedReply = replyTemplates[0];
      }
    }

    return res.json({
      success: true,
      message: "Simulacion completada",
      data: {
        keywordMatch: matchResult,
        wouldReply: matchResult.matched && !!selectedReply,
        selectedReply,
        totalTemplates: replyTemplates?.length || 0,
        simulation: true
      }
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[CommentAutoReply] testReply error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};
