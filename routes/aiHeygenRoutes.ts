import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIHeygenController from "../controllers/AIHeygenController";

const routes = express.Router();

// Heygen Video Generation
routes.get("/ai/heygen/videos", isAuth, AIHeygenController.listVideos);
routes.post("/ai/heygen/videos", isAuth, AIHeygenController.createVideo);
routes.post("/ai/heygen/generate", isAuth, AIHeygenController.createVideo); // Alias para frontend
routes.get("/ai/heygen/videos/status/:videoId", isAuth, AIHeygenController.getVideoStatus);
routes.get("/ai/heygen/avatars", isAuth, AIHeygenController.listAvatars);
routes.get("/ai/heygen/voices", isAuth, AIHeygenController.listVoices);
routes.get("/ai/heygen/quota", isAuth, AIHeygenController.getQuota);

export default routes;
