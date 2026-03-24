import express from "express";
import isAuth from "../middleware/isAuth";
import validateAICredits from "../middleware/validateAICredits";
import * as AIChatbotController from "../controllers/AIChatbotController";

const routes = express.Router();

// Rutas de consulta (requieren auth)
routes.get("/ai/chatbots", isAuth, AIChatbotController.index);
routes.get("/ai/chatbots/stats", isAuth, AIChatbotController.stats);
routes.get("/ai/chatbots/:id", isAuth, AIChatbotController.show);

// Rutas de administracion (requieren perfil admin)
routes.post("/ai/chatbots", isAuth, AIChatbotController.store);
routes.put("/ai/chatbots/:id", isAuth, AIChatbotController.update);
routes.delete("/ai/chatbots/:id", isAuth, AIChatbotController.remove);

// Rutas de data sources y entrenamiento — consumen créditos IA
routes.post("/ai/chatbots/:id/datasources", isAuth, validateAICredits("rag_query", 1), AIChatbotController.addDataSource);
routes.post("/ai/chatbots/:id/train", isAuth, validateAICredits("rag_query", 1), AIChatbotController.train);

export default routes;
