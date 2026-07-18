import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { AuditService } from '../services/auditService';
import { AuditRequest } from '../types';
import logger from '../utils/logger';

const router = Router();
const auditService = new AuditService();

// Esquema de validación para requests de auditoría
const auditRequestSchema = Joi.object({
  accountId: Joi.string().required(),
  campaignIds: Joi.array().items(Joi.string()).optional(),
  timeRange: Joi.object({
    since: Joi.string().isoDate().required(),
    until: Joi.string().isoDate().required()
  }).required(),
  analysisType: Joi.string().valid('performance', 'optimization', 'attribution', 'comprehensive').required(),
  includeRecommendations: Joi.boolean().default(true),
  language: Joi.string().valid('es', 'en').default('es')
});

/**
 * POST /audit-campaigns
 * Realizar auditoría IA de campañas
 */
router.post('/audit-campaigns', async (req: Request, res: Response) => {
  try {
    // Validar request
    const { error, value } = auditRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    const auditRequest: AuditRequest = value;

    logger.info('🚀 Nueva solicitud de auditoría', {
      accountId: auditRequest.accountId,
      analysisType: auditRequest.analysisType,
      timeRange: auditRequest.timeRange,
      campaignIds: auditRequest.campaignIds?.length || 'all'
    });

    // Realizar auditoría
    const result = await auditService.performAudit(auditRequest);

    logger.info('✅ Auditoría completada exitosamente', {
      auditId: result.id,
      insightsCount: result.insights.length,
      recommendationsCount: result.recommendations.length,
      performanceScore: result.performanceScore
    });

    res.status(200).json({
      success: true,
      audit: result
    });

  } catch (error) {
    logger.error('❌ Error en auditoría:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Audit failed'
    });
  }
});

/**
 * GET /audit/:auditId
 * Obtener resultado de auditoría por ID
 */
router.get('/audit/:auditId', async (req: Request, res: Response) => {
  try {
    const { auditId } = req.params;

    // En una implementación real, esto vendría de una base de datos
    // Por ahora retornamos un error indicando que se debe implementar almacenamiento
    res.status(501).json({
      error: 'Not implemented',
      message: 'Audit storage not implemented yet. Results are returned immediately after processing.'
    });

  } catch (error) {
    logger.error('Error retrieving audit:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /audit/account/:accountId
 * Obtener historial de auditorías de una cuenta
 */
router.get('/audit/account/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // En una implementación real, esto vendría de una base de datos
    res.status(501).json({
      error: 'Not implemented',
      message: 'Audit history not implemented yet. Consider implementing with database storage.'
    });

  } catch (error) {
    logger.error('Error retrieving audit history:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * POST /audit/quick
 * Auditoría rápida para dashboard (análisis ligero)
 */
router.post('/audit/quick', async (req: Request, res: Response) => {
  try {
    const { error, value } = Joi.object({
      accountId: Joi.string().required(),
      timeRange: Joi.object({
        since: Joi.string().isoDate().required(),
        until: Joi.string().isoDate().required()
      }).required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    // Crear request de auditoría rápida
    const quickAuditRequest: AuditRequest = {
      ...value,
      analysisType: 'performance',
      includeRecommendations: false
    };

    const result = await auditService.performAudit(quickAuditRequest);

    // Retornar solo métricas esenciales para dashboard
    res.status(200).json({
      success: true,
      quickAudit: {
        performanceScore: result.performanceScore,
        summary: result.summary,
        keyInsights: result.insights.slice(0, 3), // Solo top 3 insights
        riskCount: result.riskFactors.length,
        opportunityCount: result.opportunities.length
      }
    });

  } catch (error) {
    logger.error('Error in quick audit:', error);
    res.status(500).json({
      error: 'Quick audit failed'
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'audit-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * GET /templates
 * Obtener templates de prompts disponibles
 */
router.get('/templates', (req: Request, res: Response) => {
  try {
    const promptService = auditService['promptService']; // Acceso privado para demo
    const templates = [
      'performance_analysis',
      'attribution_analysis',
      'creative_analysis',
      'targeting_analysis',
      'executive_summary'
    ];

    res.status(200).json({
      success: true,
      templates: templates.map(name => ({
        name,
        description: `Template for ${name.replace('_', ' ')}`
      }))
    });

  } catch (error) {
    logger.error('Error listing templates:', error);
    res.status(500).json({
      error: 'Failed to list templates'
    });
  }
});

export default router;