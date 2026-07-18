import express from "express";
import isAuth from "../middleware/isAuth";
import * as TikTokController from "../controllers/TikTokController";

const tiktokRoutes = express.Router();

// ============================================================
// RUTA PÚBLICA — OAuth Callback (TikTok redirige aquí)
// DEBE estar ANTES de rutas con :tiktokId para no ser capturada
// ============================================================
tiktokRoutes.get("/tiktok/oauth/callback", TikTokController.oauthCallback);

// ============================================================
// RUTAS ESPECÍFICAS — Sin parámetros dinámicos (antes de :tiktokId)
// ============================================================
tiktokRoutes.get("/tiktok/oauth/url", isAuth, TikTokController.oauthUrl);
tiktokRoutes.get("/tiktok/business/oauth/url", isAuth, TikTokController.businessOAuthUrl);
tiktokRoutes.get("/tiktok", isAuth, TikTokController.index);
tiktokRoutes.post("/tiktok", isAuth, TikTokController.store);

// ============================================================
// RUTAS CON SUB-PATH — Más específicas antes de las genéricas
// ============================================================
tiktokRoutes.post("/tiktok/:tiktokId/poll", isAuth, TikTokController.pollNow);
tiktokRoutes.get("/tiktok/:tiktokId/videos", isAuth, TikTokController.videos);
tiktokRoutes.get("/tiktok/:tiktokId/posts", isAuth, TikTokController.listPosts);
tiktokRoutes.get("/tiktok/:tiktokId/posts/:postId/comments", isAuth, TikTokController.listComments);
tiktokRoutes.post("/tiktok/:tiktokId/comments/:commentId/reply", isAuth, TikTokController.replyToComment);
tiktokRoutes.post("/tiktok/:tiktokId/business/connect", isAuth, TikTokController.connectBusiness);

// ============================================================
// RUTAS PARAMETRIZADAS GENÉRICAS — Al final
// ============================================================
tiktokRoutes.get("/tiktok/:tiktokId", isAuth, TikTokController.show);
tiktokRoutes.put("/tiktok/:tiktokId", isAuth, TikTokController.update);
tiktokRoutes.delete("/tiktok/:tiktokId", isAuth, TikTokController.remove);

export default tiktokRoutes;
