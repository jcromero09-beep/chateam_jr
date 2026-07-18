console.log("📍 [whatsappMonitorRoutes] START loading...");
/**
 * 📊 WHATSAPP MONITOR ROUTES - JR CHATEAM v6.0.0
 */

import express from "express";
console.log("📍 [whatsappMonitorRoutes] express imported, importing controller...");
import * as WhatsAppMonitorController from "../controllers/WhatsAppMonitorController";
console.log("📍 [whatsappMonitorRoutes] controller imported, importing isAuth...");
import isAuth from "../middleware/isAuth";
console.log("📍 [whatsappMonitorRoutes] isAuth imported, creating router...");

const whatsappMonitorRoutes = express.Router();

// Todas las rutas requieren autenticación
whatsappMonitorRoutes.use(isAuth);

// Dashboard completo
whatsappMonitorRoutes.get("/dashboard", WhatsAppMonitorController.getDashboard);

// Métricas globales
whatsappMonitorRoutes.get("/metrics/global", WhatsAppMonitorController.getGlobalMetrics);

// Health status
whatsappMonitorRoutes.get("/health", WhatsAppMonitorController.getAllHealthStatuses);
whatsappMonitorRoutes.get("/health/:whatsappId", WhatsAppMonitorController.getWhatsappHealth);

// Rate limiting
whatsappMonitorRoutes.get("/metrics/ratelimit", WhatsAppMonitorController.getRateLimitMetrics);
whatsappMonitorRoutes.post("/ratelimit/unblock/:conversationId", WhatsAppMonitorController.unblockConversation);
whatsappMonitorRoutes.post("/ratelimit/reset/:conversationId", WhatsAppMonitorController.resetConversationFrequency);

// Anti-ban metrics
whatsappMonitorRoutes.get("/metrics/antiban", WhatsAppMonitorController.getAntiBanMetrics);

console.log("📍 [whatsappMonitorRoutes] ✅ FULLY LOADED");
export default whatsappMonitorRoutes;
