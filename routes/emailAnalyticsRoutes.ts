/**
 * Routes: Email Analytics (Email Marketing Fase 2)
 * Rutas CON autenticacion — requieren isAuth.
 *
 * Endpoints:
 * GET /email-analytics/overview         — KPIs generales de la company
 * GET /email-analytics/campaign/:id     — Stats detalladas de una campana
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as EmailAnalyticsController from "../controllers/EmailAnalyticsController";

const emailAnalyticsRoutes = Router();

// Overview — KPIs generales de email marketing
emailAnalyticsRoutes.get(
  "/email-analytics/overview",
  isAuth,
  EmailAnalyticsController.overview
);

// Detalle de campana — Stats, timeline, top links, dispositivos, email clients
emailAnalyticsRoutes.get(
  "/email-analytics/campaign/:id",
  isAuth,
  EmailAnalyticsController.campaignDetail
);

export default emailAnalyticsRoutes;
