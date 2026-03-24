import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

export interface CostReport {
  period: string;
  totalCost: number;
  totalTokens: number;
  costPerMessage: number;
  costByModel: Array<{ model: string; cost: number; percentage: number; tokens: number }>;
  costByAgent: Array<{ agent: string; cost: number; percentage: number }>;
  cacheImpact: { hitRate: number; estimatedSavings: number };
  recommendations: string[];
}

/**
 * Generate cost report for a company
 */
const generateCostReport = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<CostReport> => {
  try {
    // 1. Cost by model
    const modelCosts = await sequelize.query<Record<string, any>>(`
      SELECT
        "modelUsed" as model,
        SUM("costUsd")::decimal(10,6) as cost,
        SUM("inputTokens") + SUM("outputTokens") as tokens,
        COUNT(*) as calls
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :dateFrom AND (:dateTo::date + 1)
      GROUP BY "modelUsed"
      ORDER BY cost DESC
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    // 2. Cost by agent
    const agentCosts = await sequelize.query<Record<string, any>>(`
      SELECT
        "agentType" as agent,
        SUM("costUsd")::decimal(10,6) as cost,
        COUNT(*) as calls
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :dateFrom AND (:dateTo::date + 1)
      GROUP BY "agentType"
      ORDER BY cost DESC
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    // 3. Cache impact
    const cacheData = await sequelize.query<Record<string, any>>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "cacheHit" = true) as hits,
        SUM(CASE WHEN "cacheHit" = true THEN "costUsd" ELSE 0 END)::decimal(10,6) as saved
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :dateFrom AND (:dateTo::date + 1)
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    const totalCost = modelCosts.reduce((sum: number, m: any) => sum + parseFloat(m.cost || '0'), 0);
    const totalTokens = modelCosts.reduce((sum: number, m: any) => sum + parseInt(m.tokens || '0'), 0);
    const totalCalls = modelCosts.reduce((sum: number, m: any) => sum + parseInt(m.calls || '0'), 0);
    const cache = cacheData[0] || {};
    const cacheTotal = parseInt(cache.total || '0');
    const cacheHits = parseInt(cache.hits || '0');
    const hitRate = cacheTotal > 0 ? (cacheHits / cacheTotal * 100) : 0;

    // 4. Generate recommendations
    const recommendations = generateRecommendations(
      modelCosts, agentCosts, hitRate, totalCost, totalCalls
    );

    return {
      period: `${dateFrom} to ${dateTo}`,
      totalCost,
      totalTokens,
      costPerMessage: totalCalls > 0 ? totalCost / totalCalls : 0,
      costByModel: modelCosts.map((m: any) => ({
        model: m.model,
        cost: parseFloat(m.cost),
        percentage: totalCost > 0 ? (parseFloat(m.cost) / totalCost * 100) : 0,
        tokens: parseInt(m.tokens)
      })),
      costByAgent: agentCosts.map((a: any) => ({
        agent: a.agent,
        cost: parseFloat(a.cost),
        percentage: totalCost > 0 ? (parseFloat(a.cost) / totalCost * 100) : 0
      })),
      cacheImpact: {
        hitRate,
        estimatedSavings: parseFloat(cache.saved || '0')
      },
      recommendations
    };
  } catch (error: any) {
    logger.error(`[CostOptimizer] Report error: ${error.message}`);
    throw error;
  }
};

/**
 * Generate cost optimization recommendations
 */
function generateRecommendations(
  modelCosts: any[],
  agentCosts: any[],
  cacheHitRate: number,
  totalCost: number,
  totalCalls: number
): string[] {
  const recs: string[] = [];

  // Check cache hit rate
  if (cacheHitRate < 20) {
    recs.push('El cache hit rate es bajo (<20%). Considere aumentar el TTL del cache semantico.');
  } else if (cacheHitRate > 50) {
    recs.push(`Excelente cache hit rate (${cacheHitRate.toFixed(1)}%). El cache esta ahorrando costos significativos.`);
  }

  // Check expensive models usage
  const expensiveModels = modelCosts.filter((m: any) =>
    m.model && (m.model.includes('gpt-4.1') || m.model.includes('claude-3.5-sonnet'))
  );
  if (expensiveModels.length > 0) {
    const expensiveCost = expensiveModels.reduce((s: number, m: any) => s + parseFloat(m.cost), 0);
    if (expensiveCost > totalCost * 0.5) {
      recs.push('Mas del 50% del gasto es en modelos premium. Evalue si las tareas simples pueden usar modelos mini/nano.');
    }
  }

  // Check router efficiency
  const routerAgent = agentCosts.find((a: any) => a.agent === 'router');
  if (routerAgent && parseFloat(routerAgent.cost) > totalCost * 0.15) {
    recs.push('El router esta consumiendo >15% del presupuesto. Considere mas clasificacion por patrones (sin LLM).');
  }

  // Cost per message
  if (totalCalls > 0 && totalCost / totalCalls > 0.01) {
    recs.push('El costo por mensaje es alto (>$0.01). Revise el uso de modelos y la estrategia de caching.');
  }

  if (recs.length === 0) {
    recs.push('Los costos estan optimizados. Continue monitoreando las metricas.');
  }

  return recs;
}

/**
 * Get prompt caching stats
 */
const getPromptCachingStats = async (companyId: number): Promise<{
  totalCached: number;
  totalHits: number;
  estimatedSavings: number;
  topCachedQueries: Array<{ query: string; hits: number }>;
}> => {
  try {
    const stats = await sequelize.query<Record<string, any>>(`
      SELECT
        COUNT(*) as total_cached,
        SUM("hitCount") as total_hits,
        SUM("costUsd" * "hitCount")::decimal(10,4) as estimated_savings
      FROM "AISemanticCache"
      WHERE "companyId" = :companyId
        AND "expiresAt" > NOW()
    `, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    const topQueries = await sequelize.query<Record<string, any>>(`
      SELECT "queryText" as query, "hitCount" as hits
      FROM "AISemanticCache"
      WHERE "companyId" = :companyId
        AND "expiresAt" > NOW()
      ORDER BY "hitCount" DESC
      LIMIT 10
    `, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    const row = stats[0] || {};
    return {
      totalCached: parseInt(row.total_cached || '0'),
      totalHits: parseInt(row.total_hits || '0'),
      estimatedSavings: parseFloat(row.estimated_savings || '0'),
      topCachedQueries: topQueries.map((q: any) => ({
        query: q.query?.substring(0, 100) || '',
        hits: parseInt(q.hits || '0')
      }))
    };
  } catch (error: any) {
    logger.error(`[CostOptimizer] Cache stats error: ${error.message}`);
    return { totalCached: 0, totalHits: 0, estimatedSavings: 0, topCachedQueries: [] };
  }
};

export default { generateCostReport, getPromptCachingStats };
