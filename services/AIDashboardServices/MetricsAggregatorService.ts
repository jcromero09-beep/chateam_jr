import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

/**
 * Aggregates daily metrics from AIAgentLogs into AIUsageMetrics table
 */
const aggregateDaily = async (
  date: string, // YYYY-MM-DD
  companyId?: number
): Promise<void> => {
  try {
    const companyFilter = companyId ? `AND "companyId" = ${companyId}` : '';

    // Aggregate from AIAgentLogs
    const agentMetrics = await sequelize.query<Record<string, any>>(`
      SELECT
        "companyId",
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE "agentType" = 'router') as router_calls,
        COUNT(*) FILTER (WHERE "agentType" = 'rag') as rag_calls,
        COUNT(*) FILTER (WHERE "agentType" = 'sales') as sales_calls,
        COUNT(*) FILTER (WHERE "agentType" = 'support') as support_calls,
        COUNT(*) FILTER (WHERE "agentType" = 'escalation') as escalation_calls,
        COUNT(*) FILTER (WHERE "wasEscalated" = true) as escalations,
        SUM("inputTokens") as total_input_tokens,
        SUM("outputTokens") as total_output_tokens,
        SUM("costUsd") as total_cost,
        AVG("latencyMs")::integer as avg_latency,
        AVG(CASE WHEN "cacheHit" = true THEN 1 ELSE 0 END)::decimal(5,2) as cache_hit_rate,
        AVG(confidence)::decimal(3,2) as avg_confidence
      FROM "AIAgentLogs"
      WHERE DATE("createdAt") = :date ${companyFilter}
      GROUP BY "companyId"
    `, {
      replacements: { date },
      type: QueryTypes.SELECT
    });

    for (const row of agentMetrics) {
      await sequelize.query(`
        INSERT INTO "AIUsageMetrics" (
          "companyId", date, period,
          "aiMessages", "routerCalls", "ragCalls", "salesCalls", "supportCalls",
          "escalationCalls", escalations,
          "totalTokensInput", "totalTokensOutput", "totalCostUsd",
          "avgLatencyMs", "cacheHitRate", "avgConfidence",
          "createdAt"
        ) VALUES (
          :companyId, :date, 'daily',
          :totalCalls, :routerCalls, :ragCalls, :salesCalls, :supportCalls,
          :escalationCalls, :escalations,
          :totalInputTokens, :totalOutputTokens, :totalCost,
          :avgLatency, :cacheHitRate, :avgConfidence,
          NOW()
        )
        ON CONFLICT ("companyId", date, period) DO UPDATE SET
          "aiMessages" = EXCLUDED."aiMessages",
          "routerCalls" = EXCLUDED."routerCalls",
          "ragCalls" = EXCLUDED."ragCalls",
          "salesCalls" = EXCLUDED."salesCalls",
          "supportCalls" = EXCLUDED."supportCalls",
          "escalationCalls" = EXCLUDED."escalationCalls",
          escalations = EXCLUDED.escalations,
          "totalTokensInput" = EXCLUDED."totalTokensInput",
          "totalTokensOutput" = EXCLUDED."totalTokensOutput",
          "totalCostUsd" = EXCLUDED."totalCostUsd",
          "avgLatencyMs" = EXCLUDED."avgLatencyMs",
          "cacheHitRate" = EXCLUDED."cacheHitRate",
          "avgConfidence" = EXCLUDED."avgConfidence"
      `, {
        replacements: {
          companyId: row.companyId,
          date,
          totalCalls: row.total_calls || 0,
          routerCalls: row.router_calls || 0,
          ragCalls: row.rag_calls || 0,
          salesCalls: row.sales_calls || 0,
          supportCalls: row.support_calls || 0,
          escalationCalls: row.escalation_calls || 0,
          escalations: row.escalations || 0,
          totalInputTokens: row.total_input_tokens || 0,
          totalOutputTokens: row.total_output_tokens || 0,
          totalCost: row.total_cost || 0,
          avgLatency: row.avg_latency || 0,
          cacheHitRate: row.cache_hit_rate || 0,
          avgConfidence: row.avg_confidence || 0
        },
        type: QueryTypes.INSERT
      });
    }

    logger.info(`[MetricsAggregator] Aggregated ${agentMetrics.length} companies for ${date}`);
  } catch (error: any) {
    logger.error(`[MetricsAggregator] Error: ${error.message}`);
    throw error;
  }
};

export default { aggregateDaily };
