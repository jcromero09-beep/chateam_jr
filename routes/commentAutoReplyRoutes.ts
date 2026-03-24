/**
 * commentAutoReplyRoutes — Rutas del sistema Comment Auto-Reply
 * Campanas de auto-respuesta a comentarios de Facebook/Instagram.
 * Todas las rutas requieren autenticacion (isAuth).
 */

import express from "express";
import isAuth from "../middleware/isAuth";
import * as CommentAutoReplyController from "../controllers/CommentAutoReplyController";

const commentAutoReplyRoutes = express.Router();

// ─── Dashboard ───────────────────────────────────────────────────────────
commentAutoReplyRoutes.get("/comment-autoreply/dashboard", isAuth, CommentAutoReplyController.dashboard);

// ─── Campaigns CRUD ──────────────────────────────────────────────────────
commentAutoReplyRoutes.get("/comment-autoreply/campaigns", isAuth, CommentAutoReplyController.listCampaigns);
commentAutoReplyRoutes.post("/comment-autoreply/campaigns", isAuth, CommentAutoReplyController.createCampaign);
commentAutoReplyRoutes.get("/comment-autoreply/campaigns/:id", isAuth, CommentAutoReplyController.showCampaign);
commentAutoReplyRoutes.put("/comment-autoreply/campaigns/:id", isAuth, CommentAutoReplyController.updateCampaign);
commentAutoReplyRoutes.delete("/comment-autoreply/campaigns/:id", isAuth, CommentAutoReplyController.deleteCampaign);
commentAutoReplyRoutes.post("/comment-autoreply/campaigns/:id/activate", isAuth, CommentAutoReplyController.activateCampaign);
commentAutoReplyRoutes.post("/comment-autoreply/campaigns/:id/pause", isAuth, CommentAutoReplyController.pauseCampaign);

// ─── Posts discovery ─────────────────────────────────────────────────────
commentAutoReplyRoutes.get("/comment-autoreply/pages/:pageId/posts", isAuth, CommentAutoReplyController.listPagePosts);

// ─── Logs y estadisticas ─────────────────────────────────────────────────
commentAutoReplyRoutes.get("/comment-autoreply/campaigns/:id/logs", isAuth, CommentAutoReplyController.listLogs);
commentAutoReplyRoutes.get("/comment-autoreply/campaigns/:id/stats", isAuth, CommentAutoReplyController.getCampaignStats);

// ─── Acciones manuales sobre comentarios ─────────────────────────────────
commentAutoReplyRoutes.post("/comment-autoreply/comments/:commentId/reply", isAuth, CommentAutoReplyController.replyToComment);
commentAutoReplyRoutes.post("/comment-autoreply/comments/:commentId/hide", isAuth, CommentAutoReplyController.hideComment);
commentAutoReplyRoutes.delete("/comment-autoreply/comments/:commentId", isAuth, CommentAutoReplyController.deleteComment);
commentAutoReplyRoutes.post("/comment-autoreply/comments/:commentId/block", isAuth, CommentAutoReplyController.blockCommenter);

// ─── Testing ─────────────────────────────────────────────────────────────
commentAutoReplyRoutes.post("/comment-autoreply/test-match", isAuth, CommentAutoReplyController.testKeywordMatch);
commentAutoReplyRoutes.post("/comment-autoreply/test-reply", isAuth, CommentAutoReplyController.testReply);

export default commentAutoReplyRoutes;
