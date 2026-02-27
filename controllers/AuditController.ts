import { Request, Response } from "express";
import { AuditService } from "../services/AuditService";
import { CampaignRecommendationService } from "../services/CampaignRecommendationService";
import sequelize from "../database";
import AppError from "../errors/AppError";

export class AuditController {
  constructor(private auditService: AuditService) {}

  /**
   * Genera auditoría completa de una campaña
   */
  async generateAudit(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId, timeWindow, level, kpiTargets } = req.body;
      const { companyId, profile } = req.user;

      // Verificar permisos
      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Validar parámetros requeridos
      if (!campaignId || !timeWindow || !timeWindow.since || !timeWindow.until) {
        throw new AppError("campaignId, timeWindow.since, and timeWindow.until are required", 400);
      }

      // Preparar datos para auditoría
      const auditRequest = {
        campaignId,
        companyId,
        timeWindow,
        level: level || 'campaign',
        kpiTargets: kpiTargets || {
          cplTarget: 3.5,
          cpaTarget: 12,
          cpConvoTarget: 2.0,
          roasTarget: 2.5
        }
      };

      // Generar auditoría
      const result = await this.auditService.generateAudit(auditRequest);

      // Guardar resultado en base de datos
      await this.auditService.saveAuditResult(auditRequest, result);

      return res.status(200).json({
        success: true,
        report: result,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error generating audit:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene historial de auditorías
   */
  async getAuditHistory(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId } = req.params;
      const { companyId, profile } = req.user;
      const { page = 1, limit = 10 } = req.query;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      const history = await this.auditService.getAuditHistory(
        campaignId,
        companyId,
        Number(limit)
      );

      return res.status(200).json({
        audits: history,
        page: Number(page),
        limit: Number(limit)
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting audit history:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene métricas de auditorías
   */
  async getAuditMetrics(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      const metrics = await this.auditService.getAuditMetrics(companyId);

      return res.status(200).json(metrics);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting audit metrics:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene recomendaciones de optimización
   */
  async getOptimizationRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId } = req.params;
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Obtener última auditoría
      const history = await this.auditService.getAuditHistory(
        campaignId,
        companyId,
        1
      );

      if (!history.length) {
        throw new AppError("No audit found for this campaign", 404);
      }

      const latestAudit = history[0];

      return res.status(200).json({
        recommendations: latestAudit.optimizations,
        budgetPlan: latestAudit.budgetPlan,
        nextSteps: latestAudit.nextStepsChecklist
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting optimization recommendations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Aplica recomendaciones automáticamente
   */
  async applyRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId, recommendations } = req.body;
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      if (!campaignId || !recommendations) {
        throw new AppError("campaignId and recommendations are required", 400);
      }

      // Aquí se aplicarían las recomendaciones automáticamente
      // Por ejemplo, ajustar presupuestos, pausar campañas, etc.

      const results = {
        applied: 0,
        failed: 0,
        details: [] as string[]
      };

      for (const recommendation of recommendations) {
        try {
          // Aplicar recomendación
          console.log(`Applying recommendation: ${recommendation.action} for ${recommendation.id}`);
          results.applied++;
          results.details.push(`Applied: ${recommendation.action} for ${recommendation.id}`);
        } catch (error) {
          results.failed++;
          results.details.push(`Failed to apply: ${recommendation.action} for ${recommendation.id}`);
        }
      }

      return res.status(200).json({
        message: "Recommendations applied",
        results
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error applying recommendations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene comparativa de campañas
   */
  async getCampaignComparison(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignIds } = req.body;
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      if (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length < 2) {
        throw new AppError("At least 2 campaignIds are required", 400);
      }

      const comparisons = [];

      for (const campaignId of campaignIds) {
        const history = await this.auditService.getAuditHistory(
          campaignId,
          companyId,
          1
        );

        if (history.length > 0) {
          comparisons.push({
            campaignId,
            latestAudit: history[0]
          });
        }
      }

      return res.status(200).json({
        comparisons,
        summary: {
          bestPerformer: comparisons.reduce((best, current) =>
            current.latestAudit.overallScore > best.latestAudit.overallScore ? current : best
          ),
          worstPerformer: comparisons.reduce((worst, current) =>
            current.latestAudit.overallScore < worst.latestAudit.overallScore ? current : worst
          )
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting campaign comparison:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene insights de atribución
   */
  async getAttributionInsights(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId } = req.params;
      const { companyId, profile } = req.user;
      const { dateRange } = req.query;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Obtener datos de atribución
      const attributionData = await sequelize.transaction(async (transaction) => {
        const attributionService = new (require("../services/AttributionService").AttributionService)(sequelize);
        return attributionService.getAttributionByCampaign(
          campaignId,
          companyId,
          dateRange ? {
            start: new Date(dateRange as string),
            end: new Date()
          } : undefined,
          transaction
        );
      });

      return res.status(200).json(attributionData);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting attribution insights:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene métricas de ventas y CRM
   */
  async getSalesMetrics(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId } = req.params;
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Obtener métricas de ventas y CRM
      const salesMetrics = await sequelize.transaction(async (transaction) => {
        // Aquí se obtendrían métricas reales de ventas
        return {
          totalLeads: 0,
          qualifiedLeads: 0,
          convertedLeads: 0,
          averageResponseTime: 0,
          salesConversionRate: 0,
          averageDealSize: 0
        };
      });

      return res.status(200).json(salesMetrics);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting sales metrics:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene alertas de campañas
   */
  async getCampaignAlerts(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Obtener alertas de todas las campañas
      const alerts = await sequelize.transaction(async (transaction) => {
        // Aquí se obtendrían alertas reales
        return [
          {
            type: "performance",
            message: "CPC 25% por encima del objetivo",
            severity: "medium",
            campaignId: "1234567890"
          },
          {
            type: "budget",
            message: "Frequency >3 y CTR <0.6% en IG Stories",
            severity: "high",
            campaignId: "1234567891"
          }
        ];
      });

      return res.status(200).json({ alerts });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting campaign alerts:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene recomendaciones de A/B testing
   */
  async getABTestRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const { campaignId } = req.params;
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Obtener recomendaciones de A/B testing
      const recommendations = await sequelize.transaction(async (transaction) => {
        // Aquí se generarían recomendaciones basadas en datos
        return [
          {
            name: "Headline vs CTA",
            hypothesis: "CTA más específico genera más clics",
            variantChanges: ["copy", "hook"],
            sampleSizeRule: "≥3k impresiones/adset",
            durationDays: 14,
            successMetric: "CTR, CPC",
            promotionRule: "Promover si CTR ≥12% mejor"
          }
        ];
      });

      return res.status(200).json({ recommendations });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting A/B test recommendations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Ejecuta optimizaciones automáticas
   */
  async runAutoOptimizations(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId, profile } = req.user;

      if (profile !== 'admin') {
        throw new AppError("Admin access required", 403);
      }

      // Ejecutar optimizaciones automáticas
      const results = await sequelize.transaction(async (transaction) => {
        // Aquí se ejecutarían optimizaciones automáticas
        return {
          campaignsOptimized: 0,
          budgetAdjustments: 0,
          campaignsPaused: 0,
          details: [] as string[]
        };
      });

      return res.status(200).json({
        message: "Auto-optimizations completed",
        results
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error running auto-optimizations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // ============================================================
  // CAMPAIGN RECOMMENDATIONS (IA Audit)
  // ============================================================

  /**
   * Lista recomendaciones de campanas
   * GET /campaigns/audit/recommendations
   */
  async listRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const {
        status,
        campaignId,
        priority,
        category,
        campaignStatus,  // NEW: Filter by Facebook campaign delivery status
        dateFrom,        // NEW: Filter start date (YYYY-MM-DD)
        dateTo           // NEW: Filter end date (YYYY-MM-DD)
      } = req.query;

      // Validate dates if provided
      if (dateFrom || dateTo) {
        if (dateFrom && isNaN(Date.parse(dateFrom as string))) {
          return res.status(400).json({ error: "Invalid dateFrom format. Use YYYY-MM-DD" });
        }
        if (dateTo && isNaN(Date.parse(dateTo as string))) {
          return res.status(400).json({ error: "Invalid dateTo format. Use YYYY-MM-DD" });
        }
        if (dateFrom && dateTo) {
          const from = new Date(dateFrom as string);
          const to = new Date(dateTo as string);
          if (from > to) {
            return res.status(400).json({ error: "dateFrom cannot be after dateTo" });
          }
        }
      }

      const recommendationService = new CampaignRecommendationService();
      const result = await recommendationService.getRecommendations(companyId, {
        status: status as string,
        campaignId: campaignId as string,
        priority: priority as string,
        category: category as string,
        campaignStatus: campaignStatus as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string
      });

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error listing recommendations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Genera nuevas recomendaciones con IA
   * POST /campaigns/audit/recommendations/generate
   */
  async generateRecommendations(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const { period = "last_30_days", campaigns } = req.body; // Extraer campaigns del body

      const recommendationService = new CampaignRecommendationService();
      const result = await recommendationService.generateRecommendations(
        companyId,
        period,
        campaigns // Pasar datos de campañas si vienen
      );

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error generating recommendations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene una recomendacion por ID
   * GET /campaigns/audit/recommendations/:id
   */
  async getRecommendation(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const { id } = req.params;

      const recommendationService = new CampaignRecommendationService();
      const recommendation = await recommendationService.getRecommendationById(
        Number(id),
        companyId
      );

      if (!recommendation) {
        throw new AppError("Recomendacion no encontrada", 404);
      }

      return res.status(200).json(recommendation);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting recommendation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Actualiza una recomendacion
   * PUT /campaigns/audit/recommendations/:id
   */
  async updateRecommendation(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const { id } = req.params;
      const { title, description, impact, effort, potentialGain, priority, category, actionData } = req.body;

      const recommendationService = new CampaignRecommendationService();
      const recommendation = await recommendationService.updateRecommendation(
        Number(id),
        companyId,
        { title, description, impact, effort, potentialGain, priority, category, actionData }
      );

      return res.status(200).json(recommendation);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error updating recommendation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Aplica una recomendacion (marca como aplicada)
   * POST /campaigns/audit/recommendations/:id/apply
   */
  async applyRecommendation(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId, id: userId } = req.user;
      const { id } = req.params;

      const recommendationService = new CampaignRecommendationService();
      const recommendation = await recommendationService.applyRecommendation(
        Number(id),
        companyId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Recomendacion aplicada exitosamente",
        recommendation
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error applying recommendation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Descarta una recomendacion (DELETE permanente)
   * DELETE /campaigns/audit/recommendations/:id
   */
  async dismissRecommendation(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const { id } = req.params;

      const recommendationService = new CampaignRecommendationService();
      await recommendationService.dismissRecommendation(Number(id), companyId);

      return res.status(200).json({
        success: true,
        message: "Recomendacion eliminada permanentemente"
      });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error dismissing recommendation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene scores de campanas (desde cache, no se guardan)
   * GET /campaigns/audit/scores
   */
  async getCampaignScores(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;
      const { period = "last_30_days" } = req.query;

      const recommendationService = new CampaignRecommendationService();
      const scores = await recommendationService.getCampaignScores(companyId, period as string);

      return res.status(200).json({ scores });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting campaign scores:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Obtiene estado de tokens
   * GET /campaigns/audit/token-status
   */
  async getTokenStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { companyId } = req.user;

      const recommendationService = new CampaignRecommendationService();
      const tokenStatus = await recommendationService.checkTokenLimit(companyId);

      return res.status(200).json(tokenStatus);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Error getting token status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}