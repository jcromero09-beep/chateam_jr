/**
 * Service: LearningExtractionService
 * Extrae insights de metricas historicas de campanas UGC.
 * Consulta UGCCampaignMetrics de los ultimos 30 dias,
 * agrupa por tipo de contenido, horario, plataforma.
 * GPT-4o-mini genera learnings por cada insight.
 */

import { Op } from "sequelize";
import OpenAI from "openai";
import UGCCampaignMetric from "../../models/UGCCampaignMetric";
import UGCCreativeLearning from "../../models/UGCCreativeLearning";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { LearningType, LearningImpact } from "../../models/UGCCreativeLearning";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LearningExtractionRequest {
  companyId: number;
  campaignId?: number;
}

interface LearningExtractionResponse {
  learnings: UGCCreativeLearning[];
}

const LearningExtractionService = async (
  params: LearningExtractionRequest
): Promise<LearningExtractionResponse> => {
  const { companyId, campaignId } = params;

  // Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Extraccion de learnings UGC${campaignId ? ` para campana ${campaignId}` : " global"}`,
    source: "ugc_agent",
    sourceId: campaignId ? String(campaignId) : "global"
  });

  try {
    // Consultar metricas de los ultimos 30 dias
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const whereClause: Record<string, unknown> = {
      companyId,
      createdAt: { [Op.gte]: thirtyDaysAgo }
    };

    if (campaignId) {
      whereClause.campaignId = campaignId;
    }

    const metrics = await UGCCampaignMetric.findAll({
      where: whereClause,
      order: [["snapshotAt", "ASC"]],
      limit: 100
    });

    if (metrics.length === 0) {
      logger.info(
        `[LearningExtractionService] Sin metricas para analizar: company=${companyId}, campaign=${campaignId || "global"}`
      );
      return { learnings: [] };
    }

    // Agregar datos para el analisis
    const totalSnapshots = metrics.length;
    const avgViews = metrics.reduce((sum, m) => sum + m.totalViews, 0) / totalSnapshots;
    const avgEngagement = metrics.reduce((sum, m) => sum + Number(m.totalEngagement), 0) / totalSnapshots;
    const avgRoas = metrics.reduce((sum, m) => sum + Number(m.roas), 0) / totalSnapshots;

    // Tendencias temporales
    const firstHalf = metrics.slice(0, Math.floor(totalSnapshots / 2));
    const secondHalf = metrics.slice(Math.floor(totalSnapshots / 2));

    const firstHalfAvgViews = firstHalf.length > 0
      ? firstHalf.reduce((sum, m) => sum + m.totalViews, 0) / firstHalf.length
      : 0;
    const secondHalfAvgViews = secondHalf.length > 0
      ? secondHalf.reduce((sum, m) => sum + m.totalViews, 0) / secondHalf.length
      : 0;

    const viewsTrend = firstHalfAvgViews > 0
      ? ((secondHalfAvgViews - firstHalfAvgViews) / firstHalfAvgViews) * 100
      : 0;

    // Desglose por plataforma agregado
    const aggregatedPlatforms: Record<string, { views: number; engagement: number; snapshots: number }> = {};
    for (const metric of metrics) {
      const breakdown = metric.platformBreakdown as Record<string, Record<string, number>> || {};
      for (const [platform, data] of Object.entries(breakdown)) {
        if (!aggregatedPlatforms[platform]) {
          aggregatedPlatforms[platform] = { views: 0, engagement: 0, snapshots: 0 };
        }
        aggregatedPlatforms[platform].views += data.views || 0;
        aggregatedPlatforms[platform].engagement += (data.likes || 0) + (data.comments || 0) + (data.shares || 0);
        aggregatedPlatforms[platform].snapshots += 1;
      }
    }

    // Llamar a GPT-4o-mini para generar learnings
    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `Eres un analista de datos de campanas UGC.
Extrae insights de metricas historicas y genera aprendizajes accionables.
SIEMPRE responde en JSON valido sin markdown.`
        },
        {
          role: "user",
          content: `Datos de ${totalSnapshots} snapshots en los ultimos 30 dias:

Promedios generales:
- Avg Views: ${avgViews.toFixed(0)}
- Avg Engagement Rate: ${avgEngagement.toFixed(2)}%
- Avg ROAS: ${avgRoas.toFixed(2)}

Tendencias:
- Views trend (primera vs segunda mitad): ${viewsTrend.toFixed(1)}%

Desglose por plataforma:
${JSON.stringify(aggregatedPlatforms, null, 2)}

Ultimo snapshot:
- Views: ${metrics[metrics.length - 1].totalViews}
- Engagement: ${Number(metrics[metrics.length - 1].totalEngagement).toFixed(2)}%
- ROAS: ${Number(metrics[metrics.length - 1].roas).toFixed(2)}
- Purchase Intents: ${metrics[metrics.length - 1].purchaseIntents}

Genera learnings en JSON:
{
  "learnings": [
    {
      "learningType": "content_performance" | "audience_insight" | "timing_optimization" | "platform_comparison" | "creative_recommendation" | "budget_optimization" | "engagement_pattern" | "conversion_insight",
      "title": "Titulo del insight",
      "description": "Descripcion detallada",
      "impact": "low" | "medium" | "high" | "critical",
      "confidence": 0.0 a 1.0,
      "recommendation": "Accion recomendada"
    }
  ]
}

Genera entre 2 y 5 insights basados en los datos.`
        }
      ],
      temperature: 0.5,
      max_tokens: 1200,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new AppError("ERR_UGC_LEARNING_EXTRACTION_EMPTY_RESPONSE", 500);
    }

    const parsed = JSON.parse(responseText) as { learnings: Array<{
      learningType: string;
      title: string;
      description: string;
      impact: string;
      confidence: number;
      recommendation: string;
    }> };

    const validTypes: LearningType[] = [
      "content_style", "posting_time", "audience_segment",
      "hashtag", "hook_pattern", "cta_pattern",
      "avatar_preference", "platform_specific", "engagement_tactic", "anti_pattern"
    ];
    const validImpacts: LearningImpact[] = ["low", "medium", "high"];

    const learnings: UGCCreativeLearning[] = [];

    for (const item of (parsed.learnings || [])) {
      const learningType = validTypes.includes(item.learningType as LearningType)
        ? item.learningType as LearningType
        : "content_style";
      const impact = validImpacts.includes(item.impact as LearningImpact)
        ? item.impact as LearningImpact
        : "medium";
      const confidence = typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1
        ? item.confidence
        : 0.5;

      const learning = await UGCCreativeLearning.create({
        companyId,
        campaignId: campaignId || undefined,
        learningType,
        title: item.title || "Insight sin titulo",
        description: item.description || "Sin descripcion",
        impact,
        confidence,
        recommendation: item.recommendation || undefined,
        source: "ai_analysis",
        extractedBy: "gpt-5.5",
        evidence: {
          totalSnapshots,
          avgViews,
          avgEngagement,
          avgRoas,
          viewsTrend
        }
      } as Partial<UGCCreativeLearning> as UGCCreativeLearning);

      learnings.push(learning);
    }

    logger.info(
      `[LearningExtractionService] Extraccion completada: company=${companyId}, ` +
      `campaign=${campaignId || "global"}, learnings=${learnings.length}, ` +
      `snapshots=${totalSnapshots}`
    );

    return { learnings };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[LearningExtractionService] Error: ${errorMessage}`);
    throw new AppError("ERR_UGC_LEARNING_EXTRACTION_FAILED", 500);
  }
};

export default LearningExtractionService;
