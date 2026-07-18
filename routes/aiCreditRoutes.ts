import express from "express";
import isAuth from "../middleware/isAuth";
import * as AICreditController from "../controllers/AICreditController";
import * as AICreditTransactionController from "../controllers/AICreditTransactionController";

const routes = express.Router();

// Consulta de tipos de crédito
routes.get("/ai/credits/types", isAuth, AICreditController.listTypes);

// Balances de la company
routes.get("/ai/credits/balances", isAuth, AICreditController.listBalances);
routes.get("/ai/credits/quotas", isAuth, AICreditController.listBalances); // Alias para frontend (cuotas por tipo)
// Resumen agregado (UNIFICADO) — usado por AIWriter, AIMultimodal, AIAudio, etc.
routes.get("/ai/credits/summary", isAuth, AICreditController.getSummary);
routes.get("/ai/credits/balance/:key", isAuth, AICreditController.getBalance);

// Resumen de uso
routes.get("/ai/credits/usage", isAuth, AICreditController.getUsage);

// Historial de transacciones (auditoria)
routes.get("/ai/credits/transactions", isAuth, AICreditTransactionController.list);
routes.get("/ai/credits/transactions/export", isAuth, AICreditTransactionController.exportCSV);
routes.get("/ai/credits/analytics", isAuth, AICreditTransactionController.analytics);

// Gestión de créditos (admin)
routes.post("/ai/credits/add", isAuth, AICreditController.addCredits);
routes.post("/ai/credits/deduct", isAuth, AICreditController.deductCredits);
routes.post("/ai/credits/initialize", isAuth, AICreditController.initializeCredits);

export default routes;
