// [Fase2·D2.1] Rutas del AIAnalyticsController. El controller existia con 5
// endpoints (generateCopy AIDA, scoreCreative, detectAnomalies, deepDiagnose,
// getCopyMetadata) pero NUNCA se monto ninguna ruta => todos inalcanzables.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AIAnalyticsController from "../controllers/AIAnalyticsController";

const aiAnalyticsRoutes = Router();

aiAnalyticsRoutes.post("/ai-analytics/generate-copy", isAuth, AIAnalyticsController.generateCopy);
aiAnalyticsRoutes.get("/ai-analytics/copy-metadata", isAuth, AIAnalyticsController.getCopyMetadata);
aiAnalyticsRoutes.post("/ai-analytics/score-creative", isAuth, AIAnalyticsController.scoreCreative);
aiAnalyticsRoutes.post("/ai-analytics/detect-anomalies", isAuth, AIAnalyticsController.detectAnomalies);
aiAnalyticsRoutes.post("/ai-analytics/deep-diagnose", isAuth, AIAnalyticsController.deepDiagnose);

export default aiAnalyticsRoutes;
