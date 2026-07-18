/**
 * socialCommentRoutes — Módulo de Comentarios Facebook/Instagram
 * Inbox estilo TikTok: posts con comentarios, hilos, respuesta manual,
 * moderación (like/hide), configuración de modos y sync on-demand.
 * Todas las rutas requieren autenticación (isAuth).
 */

import express from "express";
import isAuth from "../middleware/isAuth";
import * as SocialCommentController from "../controllers/SocialCommentController";

const socialCommentRoutes = express.Router();

// ─── Posts y comentarios ─────────────────────────────────────────────────
socialCommentRoutes.get("/social-comments/posts", isAuth, SocialCommentController.listPosts);
socialCommentRoutes.get("/social-comments/posts/:id/comments", isAuth, SocialCommentController.listComments);

// ─── Conexiones elegibles (solo canales facebook/instagram) ──────────────
socialCommentRoutes.get("/social-comments/connections", isAuth, SocialCommentController.listConnections);

// ─── Configuración de modos (declarar antes de rutas con :id) ────────────
socialCommentRoutes.get("/social-comments/settings", isAuth, SocialCommentController.listSettings);
socialCommentRoutes.put("/social-comments/settings", isAuth, SocialCommentController.upsertSettings);

// ─── Conexión de página FB/IG (adquirir Page Access Token) ───────────────
socialCommentRoutes.post("/social-comments/connect/:whatsappId", isAuth, SocialCommentController.connectPage);
socialCommentRoutes.post("/social-comments/connect/:whatsappId/select", isAuth, SocialCommentController.connectPageSelect);

// ─── Sincronización on-demand ────────────────────────────────────────────
socialCommentRoutes.post("/social-comments/sync/:whatsappId", isAuth, SocialCommentController.sync);

// ─── Acciones sobre comentarios ──────────────────────────────────────────
socialCommentRoutes.post("/social-comments/:id/reply", isAuth, SocialCommentController.reply);
socialCommentRoutes.post("/social-comments/:id/like", isAuth, SocialCommentController.like);
socialCommentRoutes.delete("/social-comments/:id/like", isAuth, SocialCommentController.unlike);
socialCommentRoutes.post("/social-comments/:id/hide", isAuth, SocialCommentController.hide);

export default socialCommentRoutes;
