/**
 * WhatsApp Meta Dashboard Routes
 * Rutas para el dashboard de WhatsApp Business API (canal Meta)
 */

import express from "express";
import * as WhatsAppMetaDashboardController from "../controllers/WhatsAppMetaDashboardController";
import isAuth from "../middleware/isAuth";

const whatsappMetaDashboardRoutes = express.Router();

// Todas las rutas requieren autenticación
whatsappMetaDashboardRoutes.use(isAuth);

// GET /whatsapp-meta/dashboard - Dashboard completo filtrado por companyId
whatsappMetaDashboardRoutes.get(
  "/dashboard",
  WhatsAppMetaDashboardController.getDashboard
);

export default whatsappMetaDashboardRoutes;
