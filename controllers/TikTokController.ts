import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import crypto from "crypto";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import CompaniesSettings from "../models/CompaniesSettings";

import ListTikToksService from "../services/TikTokService/ListTikToksService";
import ShowTikTokService from "../services/TikTokService/ShowTikTokService";
import UpdateTikTokService from "../services/TikTokService/UpdateTikTokService";
import DeleteTikTokService from "../services/TikTokService/DeleteTikTokService";
import TikTokOAuthService from "../services/TikTokService/TikTokOAuthService";
import TikTokCommentPollerService from "../services/TikTokService/TikTokCommentPollerService";
import TikTokAPIClient from "../services/TikTokService/TikTokAPIClient";
import ListTikTokPostsService from "../services/TikTokService/ListTikTokPostsService";
import ListTikTokCommentsService from "../services/TikTokService/ListTikTokCommentsService";
import TikTokReplyService from "../services/TikTokService/TikTokReplyService";
import TikTokBusinessOAuthService from "../services/TikTokService/TikTokBusinessOAuthService";
import { TikTokBusinessAPIClient } from "../services/TikTokService/TikTokBusinessAPIClient";
import {
  createTikTokSchema,
  updateTikTokSchema,
  replyToCommentSchema,
  connectBusinessSchema,
} from "../dto/TikTokDto";
import logger from "../utils/logger";

// ============================================================
// HELPER — Extraer error de AppError (no extiende Error)
// ============================================================
const extractError = (error: any): { message: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { message: error.message, statusCode: error.statusCode };
  }
  if (error?.statusCode && error?.message) {
    return { message: error.message, statusCode: error.statusCode };
  }
  return { message: error?.message || "Error interno del servidor", statusCode: 500 };
};

// ============================================================
// INDEX — GET /tiktok — Listar conexiones TikTok de la empresa
// ============================================================
export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const tiktoks = await ListTikToksService({ companyId });
    return res.status(200).json(tiktoks);
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ error: message });
  }
};

// ============================================================
// STORE — POST /tiktok — Crear conexión TikTok (recibe OAuth code)
// ============================================================
export const store = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { name, code, queueIds } = req.body;

    await createTikTokSchema.validate({ name, code, queueIds });

    const whatsapp = await TikTokOAuthService({
      code,
      name,
      companyId,
      queueIds,
    });

    logger.info(`[TikTok] Conexión creada: ${whatsapp.name} (id: ${whatsapp.id}) para company ${companyId}`);

    return res.status(201).json({
      success: true,
      message: "Conexión TikTok creada exitosamente",
      data: whatsapp,
    });
  } catch (error: any) {
    logger.error(`[TikTok] Error al crear conexión: ${error.message}`);
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({
      success: false,
      message,
      errors: [error.message],
    });
  }
};

// ============================================================
// SHOW — GET /tiktok/:tiktokId — Ver detalle de conexión
// ============================================================
export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tiktokId } = req.params;
    const { companyId } = req.user;

    const tiktok = await ShowTikTokService(Number(tiktokId), companyId);

    return res.status(200).json({
      success: true,
      data: tiktok,
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// UPDATE — PUT /tiktok/:tiktokId — Actualizar configuración
// ============================================================
export const update = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tiktokId } = req.params;
    const { companyId } = req.user;
    const tiktokData = req.body;

    await updateTikTokSchema.validate(tiktokData);

    const { tiktok, oldDefaultTikTok } = await UpdateTikTokService({
      tiktokData,
      tiktokId: Number(tiktokId),
      companyId,
    });

    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-tiktok`, {
      action: "update",
      tiktok,
    });

    if (oldDefaultTikTok) {
      io.of(String(companyId)).emit(`company-${companyId}-tiktok`, {
        action: "update",
        tiktok: oldDefaultTikTok,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Conexión TikTok actualizada",
      data: tiktok,
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// REMOVE — DELETE /tiktok/:tiktokId — Eliminar conexión
// ============================================================
export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tiktokId } = req.params;
    const { companyId, profile } = req.user;

    if (profile !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Solo administradores pueden eliminar conexiones TikTok",
      });
    }

    await DeleteTikTokService(Number(tiktokId));

    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-tiktok`, {
      action: "delete",
      tiktokId: Number(tiktokId),
    });

    logger.info(`[TikTok] Conexión ${tiktokId} eliminada por usuario ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: "Conexión TikTok eliminada",
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// POLL NOW — POST /tiktok/:tiktokId/poll — Forzar poll manual
// ============================================================
export const pollNow = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tiktokId } = req.params;
    const { companyId } = req.user;

    // Verificar que la conexión existe y pertenece a la empresa
    const tiktok = await ShowTikTokService(Number(tiktokId), companyId);

    if (tiktok.status !== "CONNECTED") {
      return res.status(400).json({
        success: false,
        message: "La conexión TikTok no está activa",
      });
    }

    // Ejecutar poll solo para esta conexión
    const result = await TikTokCommentPollerService(Number(tiktokId));

    logger.info(`[TikTok] Poll manual ejecutado para conexión ${tiktokId}: ${result.newComments} comentarios nuevos`);

    return res.status(200).json({
      success: true,
      message: `Poll completado: ${result.newComments} comentarios nuevos encontrados`,
      data: result,
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// VIDEOS — GET /tiktok/:tiktokId/videos — Listar videos de la cuenta
// ============================================================
export const videos = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tiktokId } = req.params;
    const { companyId } = req.user;

    const tiktok = await ShowTikTokService(Number(tiktokId), companyId);

    if (!tiktok.tiktokAccessToken) {
      return res.status(400).json({
        success: false,
        message: "La conexión TikTok no tiene token de acceso",
      });
    }

    const client = new TikTokAPIClient(tiktok.tiktokAccessToken);
    const videoList = await client.listVideos(undefined, 20);

    return res.status(200).json({
      success: true,
      data: videoList,
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// OAUTH URL — GET /tiktok/oauth/url — Generar URL de autorización
// ============================================================
export const oauthUrl = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    // Leer credenciales de CompaniesSettings con fallback a .env
    const companySettings = await CompaniesSettings.findOne({ where: { companyId } });
    const clientKey = companySettings?.tiktokClientKey || process.env.TIKTOK_CLIENT_KEY;

    if (!clientKey || !redirectUri) {
      return res.status(500).json({
        success: false,
        message: "Credenciales TikTok no configuradas. Ve a Settings > TikTok para configurarlas.",
      });
    }

    // Generar state con companyId encriptado para seguridad
    const state = `${companyId}_${crypto.randomBytes(16).toString("hex")}`;

    const authUrl = TikTokAPIClient.buildAuthorizationUrl(clientKey, redirectUri, state);

    return res.status(200).json({
      success: true,
      data: { authUrl, state },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// LIST POSTS — GET /tiktok/:tiktokId/posts — Listar videos/posts
// ============================================================
export const listPosts = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit } = req.query;

    const result = await ListTikTokPostsService({
      companyId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    return res.status(200).json({
      success: true,
      data: result.posts,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// LIST COMMENTS — GET /tiktok/:tiktokId/posts/:postId/comments
// ============================================================
export const listComments = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { postId } = req.params;
    const { page, limit } = req.query;

    const result = await ListTikTokCommentsService({
      companyId,
      socialPostId: Number(postId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });

    return res.status(200).json({
      success: true,
      data: result.comments,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// REPLY TO COMMENT — POST /tiktok/:tiktokId/comments/:commentId/reply
// ============================================================
export const replyToComment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { commentId } = req.params;
    const { replyText, useAI } = req.body;

    if (!useAI) {
      await replyToCommentSchema.validate({ replyText });
    }

    if (useAI) {
      // Auto-reply IA
      const TikTokAutoReplyService = (await import("../services/TikTokService/TikTokAutoReplyService")).default;
      const result = await TikTokAutoReplyService({
        companyId,
        commentId: Number(commentId),
      });

      return res.status(200).json({
        success: result.success,
        message: result.action === "replied"
          ? "Respuesta IA enviada exitosamente"
          : result.reason || "No se pudo generar respuesta",
        data: result,
      });
    }

    // Reply manual
    const result = await TikTokReplyService({
      companyId,
      commentId: Number(commentId),
      replyText,
      userId: req.user.id,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Error al responder comentario",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Respuesta enviada exitosamente",
      data: result.replyComment,
    });
  } catch (error: any) {
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// BUSINESS OAUTH URL — GET /tiktok/business/oauth/url
// ============================================================
export const businessOAuthUrl = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const redirectUri = process.env.TIKTOK_BUSINESS_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI;

    const settings = await CompaniesSettings.findOne({ where: { companyId } });

    if (!settings?.tiktokBusinessAppId || !redirectUri) {
      return res.status(500).json({
        success: false,
        message: "Credenciales TikTok Business no configuradas. Ve a Settings > TikTok.",
      });
    }

    const state = `biz_${companyId}_${crypto.randomBytes(16).toString("hex")}`;
    const authUrl = TikTokBusinessAPIClient.buildBusinessAuthUrl(
      settings.tiktokBusinessAppId,
      redirectUri,
      state
    );

    return res.status(200).json({
      success: true,
      data: { authUrl, state },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// CONNECT BUSINESS — POST /tiktok/:tiktokId/business/connect
// ============================================================
export const connectBusiness = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { tiktokId } = req.params;
    const { code } = req.body;

    await connectBusinessSchema.validate({ code });

    const whatsapp = await TikTokBusinessOAuthService({
      code,
      tiktokId: Number(tiktokId),
      companyId,
    });

    logger.info(
      `[TikTok] Business API conectada para conexion ${tiktokId}, company ${companyId}`
    );

    return res.status(200).json({
      success: true,
      message: "Business API conectada exitosamente. Ahora puedes responder comentarios.",
      data: whatsapp,
    });
  } catch (error: any) {
    logger.error(`[TikTok] Error conectando Business API: ${error.message}`);
    const { message, statusCode } = extractError(error);
    return res.status(statusCode).json({ success: false, message });
  }
};

// ============================================================
// OAUTH CALLBACK — GET /tiktok/oauth/callback — Redirect de TikTok (PÚBLICO)
// ============================================================
export const oauthCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      logger.error(`[TikTok] OAuth error: ${oauthError} - ${error_description}`);
      const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
      res.redirect(`${frontendUrl}/tiktok-connections?error=${encodeURIComponent(String(error_description || oauthError))}`);
      return;
    }

    if (!code || !state) {
      logger.error("[TikTok] OAuth callback sin code o state");
      const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
      res.redirect(`${frontendUrl}/tiktok-connections?error=missing_params`);
      return;
    }

    // Extraer companyId del state
    const stateStr = String(state);
    const companyId = parseInt(stateStr.split("_")[0], 10);

    if (isNaN(companyId)) {
      logger.error(`[TikTok] OAuth callback con state inválido: ${state}`);
      const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
      res.redirect(`${frontendUrl}/tiktok-connections?error=invalid_state`);
      return;
    }

    // Crear conexión TikTok con el code
    const whatsapp = await TikTokOAuthService({
      code: String(code),
      name: "", // Se llenará con el display_name del usuario TikTok
      companyId,
    });

    logger.info(`[TikTok] OAuth completado exitosamente. Conexión: ${whatsapp.id}, Company: ${companyId}`);

    // Redirigir al frontend con éxito
    const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
    res.redirect(`${frontendUrl}/tiktok-connections?success=true&connectionId=${whatsapp.id}`);
  } catch (error: any) {
    logger.error(`[TikTok] OAuth callback error: ${error.message}`);
    const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
    res.redirect(`${frontendUrl}/tiktok-connections?error=${encodeURIComponent(error.message)}`);
  }
};
