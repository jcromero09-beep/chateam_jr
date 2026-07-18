import { Router } from "express";
import { AuditController } from "../controllers/AuditController";
import { AuditService } from "../services/AuditService";
import isAuth from "../middleware/isAuth";

const router = Router();

// Crear instancias de los servicios y controlador
const auditService = new AuditService();
const auditController = new AuditController(auditService);

// ============================================================
// CAMPAIGN RECOMMENDATIONS (IA Audit)
// ============================================================

// Lista recomendaciones de campanas
router.get(
  "/campaigns/audit/recommendations",
  isAuth,
  (req, res) => auditController.listRecommendations(req, res)
);

// Genera nuevas recomendaciones con IA
router.post(
  "/campaigns/audit/recommendations/generate",
  isAuth,
  (req, res) => auditController.generateRecommendations(req, res)
);

// Obtiene una recomendacion por ID
router.get(
  "/campaigns/audit/recommendations/:id",
  isAuth,
  (req, res) => auditController.getRecommendation(req, res)
);

// Actualiza una recomendacion
router.put(
  "/campaigns/audit/recommendations/:id",
  isAuth,
  (req, res) => auditController.updateRecommendation(req, res)
);

// Aplica una recomendacion (marca como aplicada)
router.post(
  "/campaigns/audit/recommendations/:id/apply",
  isAuth,
  (req, res) => auditController.applyRecommendation(req, res)
);

// Descarta una recomendacion (DELETE permanente)
router.delete(
  "/campaigns/audit/recommendations/:id",
  isAuth,
  (req, res) => auditController.dismissRecommendation(req, res)
);

// Obtiene scores de campanas (desde cache, no se guardan)
router.get(
  "/campaigns/audit/scores",
  isAuth,
  (req, res) => auditController.getCampaignScores(req, res)
);

// Obtiene estado de tokens
router.get(
  "/campaigns/audit/token-status",
  isAuth,
  (req, res) => auditController.getTokenStatus(req, res)
);

// Exporta recomendaciones como CSV
router.get(
  "/campaigns/audit/export",
  isAuth,
  (req, res) => auditController.exportRecommendations(req, res)
);

// ============================================================
// AUDIT LEGACY ENDPOINTS (mantener compatibilidad)
// ============================================================

// Genera auditoria completa de una campana
router.post(
  "/campaigns/audit",
  isAuth,
  (req, res) => auditController.generateAudit(req, res)
);

// Obtiene historial de auditorias
router.get(
  "/campaigns/audit/:campaignId/history",
  isAuth,
  (req, res) => auditController.getAuditHistory(req, res)
);

// Obtiene metricas de auditorias
router.get(
  "/campaigns/audit/metrics",
  isAuth,
  (req, res) => auditController.getAuditMetrics(req, res)
);

// Obtiene recomendaciones de optimizacion
router.get(
  "/campaigns/audit/:campaignId/optimization",
  isAuth,
  (req, res) => auditController.getOptimizationRecommendations(req, res)
);

// Aplica recomendaciones automaticamente (legacy)
router.post(
  "/campaigns/audit/apply",
  isAuth,
  (req, res) => auditController.applyRecommendations(req, res)
);

// Obtiene comparativa de campanas
router.post(
  "/campaigns/audit/compare",
  isAuth,
  (req, res) => auditController.getCampaignComparison(req, res)
);

// Obtiene alertas de campanas
router.get(
  "/campaigns/audit/alerts",
  isAuth,
  (req, res) => auditController.getCampaignAlerts(req, res)
);

// Ejecuta optimizaciones automaticas
router.post(
  "/campaigns/audit/auto-optimize",
  isAuth,
  (req, res) => auditController.runAutoOptimizations(req, res)
);

export default router;
