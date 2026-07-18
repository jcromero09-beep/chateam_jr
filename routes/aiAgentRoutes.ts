import express from "express";
import isAuth from "../middleware/isAuth";
import validateAICredits from "../middleware/validateAICredits";
import * as AIAgentController from "../controllers/AIAgentController";

const routes = express.Router();

// Catálogo y configuración de agentes
routes.get("/ai/agents", isAuth, AIAgentController.listConfigs);
routes.get("/ai/agents/departments", isAuth, AIAgentController.listDepartments);
routes.get("/ai/agents/configs", isAuth, AIAgentController.listConfigs);
routes.post("/ai/agents/configs", isAuth, AIAgentController.createConfig);
routes.put("/ai/agents/configs/:id", isAuth, AIAgentController.updateConfig);

// Métricas de agentes
routes.get("/ai/agents/metrics", isAuth, AIAgentController.getMetrics);

// Procesar mensaje vía Supervisor (API directa) — consume crédito 'message'
routes.post("/ai/agents/process", isAuth, validateAICredits("message", 1), AIAgentController.processMessage);

export default routes;
