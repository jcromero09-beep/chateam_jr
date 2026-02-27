import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as WebChatWidgetController from "../controllers/WebChatWidgetController";

const webChatWidgetRoutes = Router();

// Rutas autenticadas (panel de admin)
webChatWidgetRoutes.post("/widgets", isAuth, WebChatWidgetController.store);
webChatWidgetRoutes.get("/widgets", isAuth, WebChatWidgetController.index);
webChatWidgetRoutes.get("/widgets/:id", isAuth, WebChatWidgetController.show);
webChatWidgetRoutes.put("/widgets/:id", isAuth, WebChatWidgetController.update);
webChatWidgetRoutes.delete("/widgets/:id", isAuth, WebChatWidgetController.remove);

// Analytics (admin ve su company, super ve todo)
webChatWidgetRoutes.get("/analytics", isAuth, WebChatWidgetController.getAnalytics);

// Rutas públicas (para el widget embebido - sin auth)
webChatWidgetRoutes.get("/public/config/:apiKey", WebChatWidgetController.getPublicConfig);
webChatWidgetRoutes.post("/public/message", WebChatWidgetController.processPublicMessage);

export default webChatWidgetRoutes;
