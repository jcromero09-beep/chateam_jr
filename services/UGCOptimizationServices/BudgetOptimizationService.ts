/**
 * Service: BudgetOptimizationService
 * Optimiza presupuesto entre plataformas y creativos.
 * Analiza ROAS por plataforma, por creativo, por agente.
 * Si hay variantes A/B, declara ganador si confidenceLevel > 0.95.
 */

import { Op } from "sequelize";
import OpenAI from "openai";
import UGCCampaign from "../../models/UGCCampaign";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCCreativeVariant from "../../models/UGCCreativeVariant";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface BudgetOptimizationRequest {
  companyId: number;
  campaignId: number;
}

interface BudgetRecommendation {
  platform: string;
  currentShare: number;
  recommendedShare: number;
  reason: string;
}

interface ABTestResult {
  variantId: number;
  variantLabel: string;
  isWinner: boolean;
  confidenceLevel: number;
  engagementRate: number;
  conversionRate: number;
}

interface BudgetOptimizationResponse {
  recommendations: BudgetRecommendation[];
  budgetAllocation: Record<string, number>;
  abTestResults: ABTestResult[];
}

const BudgetOptimizationService = async (
  params: BudgetOptimizationRequest
): Promise<BudgetOptimizationResponse> => {
  const { companyId, campaignId } = params;

  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  // Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Optimizacion de presupuesto para campana: ${campaign.name}`,
    source: "ugc_budget",
    sourceId: String(campaign.id)
  });

  try {
    // Obtener posts agrupados por plataforma
    const posts = await UGCSocialPost.findAll({
      where: { ugcCampaignId: campaignId, companyId, status: "published" }
    });

    // Analisis por plataforma
    const platformStats: Record<string, {
      posts: number;
      views: number;
      engagement: number;
      roas: number;
      purchaseIntents: number;
    }> = {};

    for (const post of posts) {
      if (!platformStats[post.platform]) {
        platformStats[post.platform] = {
          posts: 0, views: 0, engagement: 0, roas: 0, purchaseIntents: 0
        };
      }
      platformStats[post.platform].posts += 1;
      platformStats[post.platform].views += post.views;
      platformStats[post.platform].engagement += post.getTotalEngagement();
      platformStats[post.platform].roas += Number(post.roas);
      platformStats[post.platform].purchaseIntents += post.purchaseIntents;
    }

    // Calcular promedios
    const totalPosts = posts.length || 1;
    for (const platform of Object.keys(platformStats)) {
      const stats = platformStats[platform];
      stats.roas = stats.posts > 0 ? stats.roas / stats.posts : 0;
    }

    // Generar recomendaciones con GPT-4o
    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `Eres un experto en optimizacion de presupuesto publicitario para campanas UGC.
Analiza metricas por plataforma y recomienda redistribucion de presupuesto.
SIEMPRE responde en JSON valido sin markdown.`
        },
        {
          role: "user",
          content: `Presupuesto total: $${Number(campaign.budget).toFixed(2)}
Gastado: $${Number(campaign.budgetSpent).toFixed(2)}
Restante: $${campaign.getBudgetRemaining().toFixed(2)}

Metricas por plataforma:
${JSON.stringify(platformStats, null, 2)}

Genera recomendaciones en JSON:
{
  "recommendations": [
    {
      "platform": "nombre_plataforma",
      "currentShare": 0.0 a 1.0,
      "recommendedShare": 0.0 a 1.0,
      "reason": "Razon de la recomendacion"
    }
  ],
  "budgetAllocation": {
    "platform_name": monto_en_dolares
  }
}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;
    const parsed = responseText ? JSON.parse(responseText) : { recommendations: [], budgetAllocation: {} };

    const recommendations: BudgetRecommendation[] = (parsed.recommendations || []).map(
      (r: Record<string, unknown>) => ({
        platform: String(r.platform || "unknown"),
        currentShare: Number(r.currentShare) || 0,
        recommendedShare: Number(r.recommendedShare) || 0,
        reason: String(r.reason || "")
      })
    );

    const budgetAllocation: Record<string, number> = {};
    if (parsed.budgetAllocation && typeof parsed.budgetAllocation === "object") {
      for (const [key, value] of Object.entries(parsed.budgetAllocation)) {
        budgetAllocation[key] = Number(value) || 0;
      }
    }

    // Analisis A/B Testing
    const variants = await UGCCreativeVariant.findAll({
      where: { ugcCampaignId: campaignId, companyId, isActive: true }
    });

    const abTestResults: ABTestResult[] = [];

    if (variants.length >= 2) {
      // Ordenar por engagement rate
      const sortedVariants = [...variants].sort(
        (a, b) => Number(b.engagementRate) - Number(a.engagementRate)
      );

      for (const variant of sortedVariants) {
        const isWinner = Number(variant.confidenceLevel) >= 0.95;

        abTestResults.push({
          variantId: variant.id,
          variantLabel: variant.variantLabel,
          isWinner,
          confidenceLevel: Number(variant.confidenceLevel),
          engagementRate: Number(variant.engagementRate),
          conversionRate: Number(variant.conversionRate)
        });

        // Declarar ganador si confidence > 0.95
        if (isWinner && !variant.isWinner) {
          await variant.declareWinner();
          logger.info(
            `[BudgetOptimizationService] Variante ${variant.variantLabel} declarada ganadora: ` +
            `confidence=${variant.confidenceLevel}, campaign=${campaignId}`
          );
        }
      }
    }

    logger.info(
      `[BudgetOptimizationService] Optimizacion completada: campaign=${campaignId}, ` +
      `recommendations=${recommendations.length}, abTestResults=${abTestResults.length}, ` +
      `company=${companyId}`
    );

    return {
      recommendations,
      budgetAllocation,
      abTestResults
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[BudgetOptimizationService] Error: ${errorMessage}`);
    throw new AppError("ERR_UGC_BUDGET_OPTIMIZATION_FAILED", 500);
  }
};

export default BudgetOptimizationService;
