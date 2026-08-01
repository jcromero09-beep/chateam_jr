import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AICostController from "../controllers/AICostController";

const routes = express.Router();

// ============================================================================
// CoinGate (pagos cripto) — RETIRADO 2026-07-29
//
// Decisión de JC: las vías de cobro reales son PayPal y Stripe. CoinGate no se
// usa. Se retira el CABLEADO, no el código: `AICostController` y
// `services/AICoingateServices/` siguen ahí y volver a montarlo es descomentar
// estas cinco líneas.
//
// Por qué retirarlo y no dejarlo: `/ai/coingate/webhook` es un endpoint público
// sin `isAuth` (lo autentica un token en la URL). Una superficie pública que
// nadie usa es riesgo sin contrapartida — y además `createCoingatOrder` dispara
// llamadas salientes a la API de CoinGate con nuestro token.
//
// El resto de este fichero (dashboard de costos IA) NO tiene que ver con
// CoinGate y sigue activo.
// ============================================================================
// routes.post("/ai/coingate/orders", isAuth, AICostController.createCoingatOrder);
// routes.get("/ai/coingate/orders/:orderId", isAuth, AICostController.getCoingatOrder);
// routes.get("/ai/coingate/currencies", isAuth, AICostController.coingateCurrencies);
// routes.get("/ai/coingate/status", isAuth, AICostController.coingateStatus);
// routes.post("/ai/coingate/webhook", AICostController.coingateWebhook); // No auth

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
