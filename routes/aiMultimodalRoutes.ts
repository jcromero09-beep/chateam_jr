import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIMultimodalController from "../controllers/AIMultimodalController";

const routes = express.Router();

// Vision
routes.post("/ai/vision/analyze", isAuth, AIMultimodalController.analyzeImage);
routes.get("/ai/vision/history", isAuth, AIMultimodalController.getVisionHistory);

// PDF
routes.post("/ai/pdf/process", isAuth, AIMultimodalController.processPDF);

// YouTube
routes.post("/ai/youtube/transcript", isAuth, AIMultimodalController.getTranscript);

// RSS
routes.post("/ai/rss/fetch", isAuth, AIMultimodalController.fetchRSS);
routes.post("/ai/rss/ingest", isAuth, AIMultimodalController.ingestRSS);

export default routes;
