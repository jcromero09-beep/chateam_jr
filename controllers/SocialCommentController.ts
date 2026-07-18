/**
 * SocialCommentController — Módulo de Comentarios Facebook/Instagram (estilo TikTok)
 * Acciones: listPosts, listComments, reply, like, unlike, hide,
 * listSettings, upsertSettings, sync.
 * Multi-tenant: todas las queries filtran por companyId (req.user).
 * Respuesta estándar: { success, message, data }.
 */

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { logError } from "../utils/logger";

import ListSocialPostsService from "../services/SocialCommentServices/ListSocialPostsService";
import ListPostCommentsService from "../services/SocialCommentServices/ListPostCommentsService";
import ReplyToCommentService from "../services/SocialCommentServices/ReplyToCommentService";
import * as ModerateCommentService from "../services/SocialCommentServices/ModerateCommentService";
import * as CommentSettingsService from "../services/SocialCommentServices/CommentSettingsService";
import SyncPostCommentsService from "../services/SocialCommentServices/SyncPostCommentsService";
import * as ConnectPageService from "../services/SocialCommentServices/ConnectPageService";
import ListEligibleConnectionsService from "../services/SocialCommentServices/ListEligibleConnectionsService";

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

// ─── 1. Listar posts con comentarios ─────────────────────────────────────

export const listPosts = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const platform = req.query.platform as string | undefined;
    const pageNumber = (req.query.pageNumber as string) || "1";

    const result = await ListSocialPostsService({ companyId, platform, pageNumber });
    return res.json({ success: true, message: "Posts listados", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] listPosts error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 2. Listar comentarios de un post ────────────────────────────────────

export const listComments = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const pageNumber = (req.query.pageNumber as string) || "1";

    const result = await ListPostCommentsService({
      companyId,
      socialPostId: Number(id),
      pageNumber
    });
    return res.json({ success: true, message: "Comentarios listados", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] listComments error", { error: msg, postId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 3. Responder manualmente a un comentario ────────────────────────────

export const reply = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "El mensaje es requerido" });
    }

    const result = await ReplyToCommentService({
      companyId,
      commentId: Number(id),
      message
    });
    return res.json({ success: true, message: "Respuesta enviada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] reply error", { error: msg, commentId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 4. Like (solo Facebook) ─────────────────────────────────────────────

export const like = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const result = await ModerateCommentService.setLike({
      companyId,
      commentId: Number(id),
      add: true
    });
    return res.json({ success: true, message: "Like aplicado", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] like error", { error: msg, commentId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 5. Quitar like (solo Facebook) ──────────────────────────────────────

export const unlike = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const result = await ModerateCommentService.setLike({
      companyId,
      commentId: Number(id),
      add: false
    });
    return res.json({ success: true, message: "Like removido", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] unlike error", { error: msg, commentId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 6. Ocultar / mostrar comentario ─────────────────────────────────────

export const hide = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { hidden } = req.body as { hidden?: boolean };

    const result = await ModerateCommentService.setHidden({
      companyId,
      commentId: Number(id),
      hidden: hidden !== false
    });
    return res.json({
      success: true,
      message: hidden !== false ? "Comentario ocultado" : "Comentario visible",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] hide error", { error: msg, commentId: req.params.id });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 7. Listar configuración de modos ────────────────────────────────────

export const listSettings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const pageNumber = (req.query.pageNumber as string) || "1";

    const result = await CommentSettingsService.listSettings({ companyId, pageNumber });
    return res.json({ success: true, message: "Configuración listada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] listSettings error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 8. Guardar configuración (upsert por conexión/post) ─────────────────

export const upsertSettings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, socialPostId, mode, autoMessage, aiAgentConfigId, isActive } =
      req.body as {
        whatsappId?: number;
        socialPostId?: number | null;
        mode?: string;
        autoMessage?: string | null;
        aiAgentConfigId?: number | null;
        isActive?: boolean;
      };

    const result = await CommentSettingsService.upsertSettings({
      companyId,
      whatsappId: Number(whatsappId),
      socialPostId: socialPostId ?? null,
      mode: mode || "",
      autoMessage,
      aiAgentConfigId,
      isActive
    });
    return res.json({ success: true, message: "Configuración guardada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] upsertSettings error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 9. Conectar página FB/IG (adquirir Page Access Token) ──────────────

export const connectPage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId } = req.params;
    const { userAccessToken } = req.body as { userAccessToken?: string };

    const result = await ConnectPageService.connectPage({
      companyId,
      whatsappId: Number(whatsappId),
      userAccessToken: userAccessToken || ""
    });

    return res.json({
      success: true,
      message: result.connected
        ? "Página conectada correctamente"
        : "Selecciona la página que deseas conectar",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] connectPage error", {
      error: msg,
      whatsappId: req.params.whatsappId
    });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 10. Conectar página elegida por el usuario ──────────────────────────

export const connectPageSelect = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId } = req.params;
    const { userAccessToken, pageId } = req.body as {
      userAccessToken?: string;
      pageId?: string;
    };

    const result = await ConnectPageService.selectPage({
      companyId,
      whatsappId: Number(whatsappId),
      userAccessToken: userAccessToken || "",
      pageId: pageId || ""
    });

    return res.json({
      success: true,
      message: "Página conectada correctamente",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] connectPageSelect error", {
      error: msg,
      whatsappId: req.params.whatsappId
    });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 11. Sincronización on-demand ────────────────────────────────────────

export const sync = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId } = req.params;

    const result = await SyncPostCommentsService({
      companyId,
      whatsappId: Number(whatsappId)
    });
    return res.json({ success: true, message: "Sincronización completada", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] sync error", { error: msg, whatsappId: req.params.whatsappId });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

// ─── 12. Conexiones elegibles (SOLO canales facebook/instagram) ──────────

export const listConnections = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const searchParam = req.query.searchParam as string | undefined;
    const pageNumber = (req.query.pageNumber as string) || "1";

    const result = await ListEligibleConnectionsService({
      companyId,
      searchParam,
      pageNumber
    });
    return res.json({ success: true, message: "Conexiones elegibles", data: result });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logError("[SocialComments] listConnections error", { error: msg });
    return res.status(statusCode).json({ success: false, message: msg });
  }
};
