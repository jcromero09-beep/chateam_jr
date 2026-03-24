import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIChatbotDomainController from "../controllers/AIChatbotDomainController";

const routes = express.Router();

routes.get("/ai/chatbot-domains", isAuth, AIChatbotDomainController.index);
routes.post("/ai/chatbot-domains", isAuth, AIChatbotDomainController.store);
routes.put("/ai/chatbot-domains/:id", isAuth, AIChatbotDomainController.update);
routes.delete("/ai/chatbot-domains/:id", isAuth, AIChatbotDomainController.remove);

export default routes;
