/**
 * Service: FeedbackLoopService
 * Loop autonomo de optimizacion de campanas UGC.
 * Se ejecuta cada 4-6h para campanas activas:
 * 1. Tomar snapshot de metricas -> crear UGCCampaignMetric
 * 2. Comparar con snapshot anterior (delta)
 * 3. Llamar GPT-4o para analizar tendencias y generar insights
 * 4. Crear UGCCreativeLearning con los insights extraidos
 * 5. Si autoOptimize es true, aplicar recomendaciones automaticamente
 * 6. Deducir credito 'agent_execution'
 */

import { Op, fn, col, literal } from "sequelize";
import OpenAI from "openai";
import UGCCampaign from "../../models/UGCCampaign";
import UGCCampaignMetric from "../../models/UGCCampaignMetric";
import UGCCreativeLearning from "../../models/UGCCreativeLearning";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import UGCVideoJob from "../../models/UGCVideoJob";
import AgentIdentity from "../../models/AgentIdentity";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { LearningType, LearningImpact } from "../../models/UGCCreativeLearning";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface FeedbackLoopRequest {
  companyId: number;
  campaignId: number;
}

interface GPTLearningItem {
  learningType: string;
  title: string;
  description: string;
  impact: string;
  confidence: number;
  recommendation: string;
}

interface FeedbackLoopResponse {
  metricsSnapshot: UGCCampaignMetric;
  learnings: UGCCreativeLearning[];
  autoApplied: boolean;
}

const FeedbackLoopService = async (
  params: FeedbackLoopRequest
): Promise<FeedbackLoopResponse> => {
  const { companyId, campaignId } = params;

  // 1. Cargar campana con relaciones
  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId },
    include: [
      { model: UGCVideoJob, as: "videoJobs", required: false },
      { model: UGCSocialPost, as: undefined, required: false }
    ]
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  if (!["active", "optimizing", "publishing"].includes(campaign.status)) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_ACTIVE", 400);
  }

  // Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Feedback loop para campana UGC: ${campaign.name}`,
    source: "ugc_agent",
    sourceId: String(campaign.id)
  });

  try {
    // 2. Agregar metricas de todos los posts de la campana
    const posts = await UGCSocialPost.findAll({
      where: { ugcCampaignId: campaignId, companyId }
    });

    const totalViews = posts.reduce((sum, p) => sum + p.views, 0);
    const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.comments, 0);
    const totalShares = posts.reduce((sum, p) => sum + p.shares, 0);
    const totalReach = posts.reduce((sum, p) => sum + p.reachCount, 0);
    const totalImpressions = posts.reduce((sum, p) => sum + p.impressionCount, 0);
    const totalPurchaseIntents = posts.reduce((sum, p) => sum + p.purchaseIntents, 0);
    const totalWhatsappTriggers = posts.reduce((sum, p) => sum + p.whatsappTriggers, 0);
    const avgEngagement = posts.length > 0
      ? posts.reduce((sum, p) => sum + Number(p.engagementRate), 0) / posts.length
      : 0;
    const avgRoas = posts.length > 0
      ? posts.reduce((sum, p) => sum + Number(p.roas), 0) / posts.length
      : 0;

    // Desglose por plataforma
    const platformBreakdown: Record<string, Record<string, number>> = {};
    for (const post of posts) {
      if (!platformBreakdown[post.platform]) {
        platformBreakdown[post.platform] = {
          views: 0, likes: 0, comments: 0, shares: 0, posts: 0
        };
      }
      platformBreakdown[post.platform].views += post.views;
      platformBreakdown[post.platform].likes += post.likes;
      platformBreakdown[post.platform].comments += post.comments;
      platformBreakdown[post.platform].shares += post.shares;
      platformBreakdown[post.platform].posts += 1;
    }

    // Top performing content
    const sortedPosts = [...posts]
      .sort((a, b) => b.getTotalEngagement() - a.getTotalEngagement())
      .slice(0, 5);

    const topPerformingContent = sortedPosts.map(p => ({
      postId: p.id,
      platform: p.platform,
      views: p.views,
      engagement: p.getTotalEngagement(),
      engagementRate: Number(p.engagementRate)
    }));

    // Calcular metricas de costo
    const budgetSpent = Number(campaign.budgetSpent) || 0;
    const costPerView = totalViews > 0 ? budgetSpent / totalViews : 0;
    const costPerEngagement = (totalLikes + totalComments + totalShares) > 0
      ? budgetSpent / (totalLikes + totalComments + totalShares)
      : 0;

    // Contar videos y agentes activos
    const videoCount = campaign.videoJobs?.length || 0;
    const activeAgentIds = [...new Set(posts.map(p => p.agentIdentityId).filter(Boolean))];

    // Comentarios recientes (ultimas 24h)
    const recentComments = await UGCPostComment.findAll({
      where: {
        companyId,
        socialPostId: { [Op.in]: posts.map(p => p.id) },
        createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      limit: 50,
      order: [["createdAt", "DESC"]]
    });

    const respondedComments = recentComments.filter(c => c.autoReplyStatus === "sent");
    const commentResponseRate = recentComments.length > 0
      ? (respondedComments.length / recentComments.length) * 100
      : 0;

    // 2. Crear snapshot de metricas
    const metricsSnapshot = await UGCCampaignMetric.create({
      companyId,
      campaignId,
      snapshotAt: new Date(),
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      totalEngagement: avgEngagement,
      totalReach,
      totalImpressions,
      purchaseIntents: totalPurchaseIntents,
      whatsappTriggers: totalWhatsappTriggers,
      newFollowers: 0,
      costPerView,
      costPerEngagement,
      roas: avgRoas,
      videoCount,
      activeAgentCount: activeAgentIds.length,
      commentResponseRate,
      avgConsistencyScore: 0,
      platformBreakdown,
      topPerformingContent,
      metadata: {
        postsAnalyzed: posts.length,
        commentsAnalyzed: recentComments.length
      }
    } as Partial<UGCCampaignMetric> as UGCCampaignMetric);

    // 3. Obtener snapshot anterior para comparar deltas
    const previousSnapshot = await UGCCampaignMetric.findOne({
      where: {
        campaignId,
        companyId,
        id: { [Op.lt]: metricsSnapshot.id }
      },
      order: [["createdAt", "DESC"]]
    });

    const prevSnapshotData = previousSnapshot ? {
      totalViews: previousSnapshot.totalViews,
      totalLikes: previousSnapshot.totalLikes,
      totalComments: previousSnapshot.totalComments,
      totalShares: previousSnapshot.totalShares,
      purchaseIntents: previousSnapshot.purchaseIntents,
      roas: Number(previousSnapshot.roas),
      totalEngagement: Number(previousSnapshot.totalEngagement)
    } : null;

    // 4. Llamar a GPT-4o para analizar tendencias
    const systemPrompt = `Eres un analista de marketing de contenido UGC experto.
Analiza metricas de campana y genera insights accionables.
SIEMPRE responde en formato JSON valido, sin markdown ni texto adicional.`;

    const userPrompt = `Analiza estas metricas de campana UGC y genera insights accionables.

Metricas actuales:
- Views: ${totalViews}, Likes: ${totalLikes}, Comments: ${totalComments}, Shares: ${totalShares}
- Engagement Rate: ${avgEngagement.toFixed(2)}%, ROAS: ${avgRoas.toFixed(2)}
- Purchase Intents: ${totalPurchaseIntents}, WhatsApp Triggers: ${totalWhatsappTriggers}
- Videos activos: ${videoCount}, Agentes activos: ${activeAgentIds.length}
- Comment Response Rate: ${commentResponseRate.toFixed(1)}%
- Plataformas: ${JSON.stringify(platformBreakdown)}

${prevSnapshotData ? `Metricas anteriores:
- Views: ${prevSnapshotData.totalViews}, Likes: ${prevSnapshotData.totalLikes}
- Comments: ${prevSnapshotData.totalComments}, Shares: ${prevSnapshotData.totalShares}
- Purchase Intents: ${prevSnapshotData.purchaseIntents}, ROAS: ${prevSnapshotData.roas}
- Engagement: ${prevSnapshotData.totalEngagement}%` : "No hay snapshot anterior (primera ejecucion)."}

Comentarios recientes (ultimos): ${recentComments.slice(0, 10).map(c => `@${c.authorUsername}: "${c.content.substring(0, 100)}"`).join(", ")}

Genera recomendaciones en JSON:
{
  "learnings": [
    {
      "learningType": "content_performance" | "audience_insight" | "timing_optimization" | "platform_comparison" | "creative_recommendation" | "budget_optimization" | "engagement_pattern" | "conversion_insight",
      "title": "Titulo corto del insight",
      "description": "Descripcion detallada",
      "impact": "low" | "medium" | "high" | "critical",
      "confidence": 0.0 a 1.0,
      "recommendation": "Accion recomendada"
    }
  ]
}

Genera entre 2 y 5 insights relevantes.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new AppError("ERR_UGC_FEEDBACK_LOOP_EMPTY_RESPONSE", 500);
    }

    const parsed = JSON.parse(responseText) as { learnings: GPTLearningItem[] };

    // 5. Crear UGCCreativeLearning por cada insight
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
        campaignId,
        learningType,
        title: item.title || "Insight sin titulo",
        description: item.description || "Sin descripcion",
        impact,
        confidence,
        recommendation: item.recommendation || undefined,
        source: "feedback_loop",
        extractedBy: "gpt-4o",
        evidence: {
          snapshotId: metricsSnapshot.id,
          previousSnapshotId: previousSnapshot?.id || null
        }
      } as Partial<UGCCreativeLearning> as UGCCreativeLearning);

      learnings.push(learning);
    }

    // 6. Auto-aplicar si optimizationConfig.autoOptimize es true
    const optimConfig = campaign.optimizationConfig || {};
    const autoOptimize = Boolean((optimConfig as Record<string, unknown>).autoOptimize);
    let autoApplied = false;

    if (autoOptimize && learnings.length > 0) {
      // Marcar learnings de alto impacto como auto-aplicados
      const highImpactLearnings = learnings.filter(
        l => l.impact === "high"
      );

      for (const learning of highImpactLearnings) {
        await learning.update({
          appliedAt: new Date(),
          appliedResult: { autoApplied: true, appliedBy: "feedback_loop" }
        });
      }

      autoApplied = highImpactLearnings.length > 0;
    }

    // Actualizar nextOptimizationAt
    const nextOptHours = (optimConfig as Record<string, unknown>).optimizationInterval as number || 4;
    await campaign.update({
      nextOptimizationAt: new Date(Date.now() + nextOptHours * 60 * 60 * 1000)
    });

    logger.info(
      `[FeedbackLoopService] Ciclo completado: campaign=${campaignId}, ` +
      `snapshotId=${metricsSnapshot.id}, learnings=${learnings.length}, ` +
      `autoApplied=${autoApplied}, company=${companyId}`
    );

    return {
      metricsSnapshot,
      learnings,
      autoApplied
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[FeedbackLoopService] Error en feedback loop: ${errorMessage}`);
    throw new AppError("ERR_UGC_FEEDBACK_LOOP_FAILED", 500);
  }
};

export default FeedbackLoopService;
