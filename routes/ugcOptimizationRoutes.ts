/**
 * Routes: UGC Optimization (UGC Campaign System — Phase 3)
 * Define las rutas para el sistema de optimizacion autonoma de campanas UGC.
 *
 * Endpoints:
 * POST   /api/ugc/optimization/:campaignId/run               - Ejecuta feedback loop
 * POST   /api/ugc/optimization/:campaignId/optimize-budget    - Optimiza presupuesto
 * POST   /api/ugc/optimization/:campaignId/extract-learnings  - Extrae learnings
 * GET    /api/ugc/optimization/history                        - Historial de learnings
 * GET    /api/ugc/optimization/learnings                      - Lista learnings con filtros
 * GET    /api/ugc/optimization/:campaignId/metrics            - Metricas de campana
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCOptimizationController from "../controllers/UGCOptimizationController";

const ugcOptimizationRoutes = Router();

// --- Rutas sin parametros ANTES de rutas con :campaignId ---

// Historial de optimizaciones
ugcOptimizationRoutes.get(
  "/ugc/optimization/history",
  isAuth,
  UGCOptimizationController.listHistory
);

// Lista learnings con filtros
ugcOptimizationRoutes.get(
  "/ugc/optimization/learnings",
  isAuth,
  UGCOptimizationController.listLearnings
);

// --- Rutas con parametro :campaignId ---

// Ejecutar feedback loop
ugcOptimizationRoutes.post(
  "/ugc/optimization/:campaignId/run",
  isAuth,
  UGCOptimizationController.runFeedbackLoop
);

// Optimizar presupuesto
ugcOptimizationRoutes.post(
  "/ugc/optimization/:campaignId/optimize-budget",
  isAuth,
  UGCOptimizationController.optimizeBudget
);

// Extraer learnings
ugcOptimizationRoutes.post(
  "/ugc/optimization/:campaignId/extract-learnings",
  isAuth,
  UGCOptimizationController.extractLearnings
);

// Metricas de campana
ugcOptimizationRoutes.get(
  "/ugc/optimization/:campaignId/metrics",
  isAuth,
  UGCOptimizationController.listMetrics
);

export default ugcOptimizationRoutes;
