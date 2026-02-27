/**
 * WhatsApp Template Routes
 * Rutas para gestión de plantillas de WhatsApp Business API
 */

import express from "express";
import * as WhatsAppTemplateController from "../controllers/WhatsAppTemplateController";
import isAuth from "../middleware/isAuth";

const whatsappTemplateRoutes = express.Router();

// Todas las rutas requieren autenticación
whatsappTemplateRoutes.use(isAuth);

// CRUD básico
whatsappTemplateRoutes.get("/", WhatsAppTemplateController.index);
whatsappTemplateRoutes.get("/:templateId", WhatsAppTemplateController.show);
whatsappTemplateRoutes.post("/", WhatsAppTemplateController.store);
whatsappTemplateRoutes.put("/:templateId", WhatsAppTemplateController.update);
whatsappTemplateRoutes.delete("/:templateId", WhatsAppTemplateController.remove);

// Integración con Meta
whatsappTemplateRoutes.post("/:templateId/submit", WhatsAppTemplateController.submitToMeta);
whatsappTemplateRoutes.post("/sync", WhatsAppTemplateController.syncFromMeta);

export default whatsappTemplateRoutes;
