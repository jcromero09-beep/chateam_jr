/**
 * AIAnalyticsController
 *
 * Endpoints REST para las funcionalidades de IA Avanzada (Fase 4):
 *
 * POST /meta-marketing/ai/diagnose        → Diagnóstico profundo de campaña
 * POST /meta-marketing/ai/copy/generate   → Generación de copy con IA
 * GET  /meta-marketing/ai/copy/metadata   → Niveles de conciencia, tonos, objetivos
 * POST /meta-marketing/ai/creative/score  → Scoring predictivo de creativo
 * GET  /meta-marketing/ai/anomalies       → Detección de anomalías
 */

import { Request, Response } from "express";
import CampaignRecommendationService from "../services/CampaignRecommendationService";
import AdCopyGeneratorService from "../services/AdCopyGeneratorService";
import CreativeScoringService from "../services/CreativeScoringService";
import AnomalyDetectionService from "../services/AnomalyDetectionService";
import logger from "../utils/logger";

const LOG_PREFIX = "[AIAnalyticsController]";
const recommendationService = new CampaignRecommendationService();

// ============================================================
// POST /meta-marketing/ai/diagnose
// Diagnóstico profundo de una campaña (6 tipos de análisis)
// ============================================================
export const deepDiagnose = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { campaignId, campaignsData } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere campaignId"
      });
    }

    logger.info(`${LOG_PREFIX} 🔍 Diagnóstico para campaña ${campaignId} — empresa ${companyId}`);

    const result = await (recommendationService as any).deepDiagnose(
      companyId,
      String(campaignId),
      campaignsData
    );

    return res.status(200).json({
      success: true,
      message: `Diagnóstico completado. Salud general: ${result.overallHealth}`,
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ deepDiagnose: ${error.message}`);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST /meta-marketing/ai/copy/generate
// Genera variaciones de copy para Meta Ads usando IA
// ============================================================
export const generateCopy = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const {
      productName,
      productDescription,
      targetAudience,
      consciousnessLevel,
      tone,
      objective,
      industry,
      uniqueValueProposition,
      callToAction,
      variationsCount
    } = req.body;

    if (!productName || !productDescription || !targetAudience || !consciousnessLevel) {
      return res.status(400).json({
        success: false,
        message: "Se requieren: productName, productDescription, targetAudience, consciousnessLevel"
      });
    }

    const validLevels = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"];
    if (!validLevels.includes(consciousnessLevel)) {
      return res.status(400).json({
        success: false,
        message: `consciousnessLevel debe ser uno de: ${validLevels.join(", ")}`
      });
    }

    logger.info(`${LOG_PREFIX} ✍️ Generando copy nivel ${consciousnessLevel} para empresa ${companyId}`);

    const result = await AdCopyGeneratorService.generateCopy(companyId, {
      productName,
      productDescription,
      targetAudience,
      consciousnessLevel,
      tone,
      objective,
      industry,
      uniqueValueProposition,
      callToAction,
      variationsCount: variationsCount ? Number(variationsCount) : 3
    });

    return res.status(200).json({
      success: true,
      message: `${result.variations.length} variaciones de copy generadas para nivel "${consciousnessLevel}"`,
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ generateCopy: ${error.message}`);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET /meta-marketing/ai/copy/metadata
// Retorna niveles de conciencia, tonos y objetivos disponibles
// ============================================================
export const getCopyMetadata = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const metadata = AdCopyGeneratorService.getMetadata();

    return res.status(200).json({
      success: true,
      message: "Metadata del generador de copy",
      data: metadata
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ getCopyMetadata: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST /meta-marketing/ai/creative/score
// Scoring predictivo de un creativo publicitario (0-100)
// ============================================================
export const scoreCreative = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const {
      headline,
      primaryText,
      description,
      cta,
      targetAudience,
      objective,
      industry,
      imageDescription
    } = req.body;

    if (!headline || !primaryText || !targetAudience || !objective) {
      return res.status(400).json({
        success: false,
        message: "Se requieren: headline, primaryText, targetAudience, objective"
      });
    }

    logger.info(`${LOG_PREFIX} 📊 Scoring creativo para empresa ${companyId}`);

    const result = await CreativeScoringService.scoreCreative(companyId, {
      headline,
      primaryText,
      description,
      cta,
      targetAudience,
      objective,
      industry,
      imageDescription
    });

    return res.status(200).json({
      success: true,
      message: `Score del creativo: ${result.overallScore}/100 (${result.grade}) — ${result.prediction}`,
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ scoreCreative: ${error.message}`);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET /meta-marketing/ai/anomalies
// Detecta anomalías estadísticas en campañas (Z-Score + IQR)
// ============================================================
export const detectAnomalies = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { period = "last_30_days" } = req.query;

    logger.info(`${LOG_PREFIX} 🔍 Detectando anomalías para empresa ${companyId}, período ${period}`);

    const result = await AnomalyDetectionService.detectAnomalies(
      companyId,
      String(period)
    );

    return res.status(200).json({
      success: true,
      message: result.anomaliesFound > 0
        ? `${result.anomaliesFound} anomalías detectadas (${result.critical} críticas, ${result.warnings} advertencias)`
        : "No se detectaron anomalías — todas las campañas están dentro de rangos normales",
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ detectAnomalies: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};
