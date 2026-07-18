import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AICostController from "../controllers/AICostController";

const routes = express.Router();

// Coingate (crypto payments)
routes.post("/ai/coingate/orders", isAuth, AICostController.createCoingatOrder);
routes.get("/ai/coingate/orders/:orderId", isAuth, AICostController.getCoingatOrder);
routes.get("/ai/coingate/currencies", isAuth, AICostController.coingateCurrencies);
routes.get("/ai/coingate/status", isAuth, AICostController.coingateStatus);
routes.post("/ai/coingate/webhook", AICostController.coingateWebhook); // No auth

// Cost optimization
routes.get("/ai/costs/report", isAuth, AICostController.getCostReport);
routes.get("/ai/costs/cache-stats", isAuth, AICostController.getCacheStats);

// ============================================================================
// Dashboard de Costos IA - Superadmin y Company
// ============================================================================

// Rutas para superadmin
routes.get("/ai-costs/summary", isAuth, isSuper, AICostController.getAISummary);
routes.get("/ai-costs/by-company", isAuth, isSuper, AICostController.getAIByCompany);
routes.get("/ai-costs/trends", isAuth, isSuper, AICostController.getAITrends);

// Ruta para admin de company
routes.get("/ai-costs/company/summary", isAuth, AICostController.getAICompanySummary);

export default routes;
