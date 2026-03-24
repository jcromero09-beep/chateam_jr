import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

export interface WidgetData {
  widgetId: string;
  title: string;
  value: any;
  change?: number; // % change from previous period
  trend?: 'up' | 'down' | 'stable';
}

/**
 * Get usage overview widget (messages, tokens, cost)
 */
const getUsageOverview = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        COALESCE(SUM("aiMessages"), 0) as "totalMessages",
        COALESCE(SUM("totalTokensInput") + SUM("totalTokensOutput"), 0) as "totalTokens",
        COALESCE(SUM("totalCostUsd"), 0) as "totalCost",
        COALESCE(AVG("avgLatencyMs"), 0) as "avgLatency"
      FROM "AIUsageMetrics"
      WHERE "companyId" = :companyId
        AND date BETWEEN :dateFrom AND :dateTo
        AND period = 'daily'
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });
    const row = result[0] || {};

    return {
      widgetId: 'usage_overview',
      title: 'Uso de IA',
      value: {
        totalMessages: parseInt(row.totalMessages || '0'),
        totalTokens: parseInt(row.totalTokens || '0'),
        totalCost: parseFloat(row.totalCost || '0'),
        avgLatency: parseInt(row.avgLatency || '0')
      }
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getUsageOverview: ${error.message}`);
    return { widgetId: 'usage_overview', title: 'Uso de IA', value: {} };
  }
};

/**
 * Get agent distribution widget
 */
const getAgentDistribution = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        COALESCE(SUM("routerCalls"), 0) as router,
        COALESCE(SUM("ragCalls"), 0) as rag,
        COALESCE(SUM("salesCalls"), 0) as sales,
        COALESCE(SUM("supportCalls"), 0) as support,
        COALESCE(SUM("escalationCalls"), 0) as escalation
      FROM "AIUsageMetrics"
      WHERE "companyId" = :companyId
        AND date BETWEEN :dateFrom AND :dateTo
        AND period = 'daily'
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    return {
      widgetId: 'agent_distribution',
      title: 'Distribucion de Agentes',
      value: result[0] || { router: 0, rag: 0, sales: 0, support: 0, escalation: 0 }
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getAgentDistribution: ${error.message}`);
    return { widgetId: 'agent_distribution', title: 'Distribucion de Agentes', value: {} };
  }
};

/**
 * Get cost breakdown by provider
 */
const getCostBreakdown = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        "modelUsed",
        COUNT(*) as calls,
        SUM("costUsd")::decimal(10,4) as total_cost,
        SUM("inputTokens") as input_tokens,
        SUM("outputTokens") as output_tokens
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :dateFrom AND (:dateTo::date + 1)
      GROUP BY "modelUsed"
      ORDER BY total_cost DESC
      LIMIT 10
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    return {
      widgetId: 'cost_breakdown',
      title: 'Costos por Modelo',
      value: result.map((r: any) => ({
        model: r.modelUsed,
        calls: parseInt(r.calls),
        cost: parseFloat(r.total_cost || '0'),
        tokens: parseInt(r.input_tokens || '0') + parseInt(r.output_tokens || '0')
      }))
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getCostBreakdown: ${error.message}`);
    return { widgetId: 'cost_breakdown', title: 'Costos por Modelo', value: [] };
  }
};

/**
 * Get resolution rate widget
 */
const getResolutionRate = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        COALESCE(SUM("aiMessages"), 0) as total,
        COALESCE(SUM(escalations), 0) as escalated,
        CASE WHEN SUM("aiMessages") > 0
          THEN ((SUM("aiMessages") - SUM(escalations))::decimal / SUM("aiMessages") * 100)::decimal(5,2)
          ELSE 0 END as resolution_rate
      FROM "AIUsageMetrics"
      WHERE "companyId" = :companyId
        AND date BETWEEN :dateFrom AND :dateTo
        AND period = 'daily'
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });
    const row = result[0] || {};

    return {
      widgetId: 'resolution_rate',
      title: 'Tasa de Resolucion IA',
      value: {
        total: parseInt(row.total || '0'),
        escalated: parseInt(row.escalated || '0'),
        resolutionRate: parseFloat(row.resolution_rate || '0')
      }
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getResolutionRate: ${error.message}`);
    return { widgetId: 'resolution_rate', title: 'Tasa de Resolucion IA', value: {} };
  }
};

/**
 * Get performance trends (daily data for charts)
 */
const getPerformanceTrends = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        date,
        "aiMessages",
        "totalCostUsd",
        "avgLatencyMs",
        "cacheHitRate",
        "avgConfidence",
        escalations
      FROM "AIUsageMetrics"
      WHERE "companyId" = :companyId
        AND date BETWEEN :dateFrom AND :dateTo
        AND period = 'daily'
      ORDER BY date ASC
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });

    return {
      widgetId: 'performance_trends',
      title: 'Tendencias de Rendimiento',
      value: result
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getPerformanceTrends: ${error.message}`);
    return { widgetId: 'performance_trends', title: 'Tendencias de Rendimiento', value: [] };
  }
};

/**
 * Get cache efficiency widget
 */
const getCacheEfficiency = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE "cacheHit" = true) as cache_hits,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE "cacheHit" = true)::decimal / COUNT(*) * 100)::decimal(5,2)
          ELSE 0 END as hit_rate,
        COALESCE(SUM(CASE WHEN "cacheHit" = true THEN "costUsd" ELSE 0 END), 0)::decimal(10,4) as cost_saved
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :dateFrom AND (:dateTo::date + 1)
    `, {
      replacements: { companyId, dateFrom, dateTo },
      type: QueryTypes.SELECT
    });
    const row = result[0] || {};

    return {
      widgetId: 'cache_efficiency',
      title: 'Eficiencia de Cache',
      value: {
        totalQueries: parseInt(row.total_queries || '0'),
        cacheHits: parseInt(row.cache_hits || '0'),
        hitRate: parseFloat(row.hit_rate || '0'),
        costSaved: parseFloat(row.cost_saved || '0')
      }
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getCacheEfficiency: ${error.message}`);
    return { widgetId: 'cache_efficiency', title: 'Eficiencia de Cache', value: {} };
  }
};

/**
 * Get system status widget (provider health)
 */
const getSystemStatus = async (): Promise<WidgetData> => {
  // Check recent errors by model/provider
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        "modelUsed",
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE confidence > 0.5) as successful,
        AVG("latencyMs")::integer as avg_latency
      FROM "AIAgentLogs"
      WHERE "createdAt" > NOW() - INTERVAL '1 hour'
      GROUP BY "modelUsed"
      ORDER BY total DESC
    `, { type: QueryTypes.SELECT });

    return {
      widgetId: 'system_status',
      title: 'Estado del Sistema',
      value: result.map((r: any) => ({
        model: r.modelUsed,
        total: parseInt(r.total),
        successRate: parseInt(r.total) > 0 ? (parseInt(r.successful) / parseInt(r.total) * 100).toFixed(1) : '0',
        avgLatency: r.avg_latency
      }))
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getSystemStatus: ${error.message}`);
    return { widgetId: 'system_status', title: 'Estado del Sistema', value: [] };
  }
};

/**
 * Get top companies by AI usage (admin only)
 */
const getTopCompanies = async (
  dateFrom: string,
  dateTo: string,
  limit: number = 10
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        m."companyId",
        c.name as company_name,
        SUM(m."aiMessages") as total_messages,
        SUM(m."totalCostUsd")::decimal(10,4) as total_cost,
        AVG(m."avgConfidence")::decimal(3,2) as avg_confidence
      FROM "AIUsageMetrics" m
      LEFT JOIN "Companies" c ON c.id = m."companyId"
      WHERE m.date BETWEEN :dateFrom AND :dateTo
        AND m.period = 'daily'
        AND m."companyId" IS NOT NULL
      GROUP BY m."companyId", c.name
      ORDER BY total_messages DESC
      LIMIT :limit
    `, {
      replacements: { dateFrom, dateTo, limit },
      type: QueryTypes.SELECT
    });

    return {
      widgetId: 'top_companies',
      title: 'Empresas Top por Uso IA',
      value: result
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getTopCompanies: ${error.message}`);
    return { widgetId: 'top_companies', title: 'Empresas Top por Uso IA', value: [] };
  }
};

/**
 * Get recent activity widget
 */
const getRecentActivity = async (
  companyId: number,
  limit: number = 20
): Promise<WidgetData> => {
  try {
    const result = await sequelize.query<Record<string, any>>(`
      SELECT
        id,
        "agentType",
        "modelUsed",
        "inputTokens" + "outputTokens" as tokens,
        "costUsd",
        "latencyMs",
        confidence,
        "wasEscalated",
        "cacheHit",
        "inputSummary",
        "createdAt"
      FROM "AIAgentLogs"
      WHERE "companyId" = :companyId
      ORDER BY "createdAt" DESC
      LIMIT :limit
    `, {
      replacements: { companyId, limit },
      type: QueryTypes.SELECT
    });

    return {
      widgetId: 'recent_activity',
      title: 'Actividad Reciente',
      value: result
    };
  } catch (error: any) {
    logger.error(`[DashboardWidgets] Error en getRecentActivity: ${error.message}`);
    return { widgetId: 'recent_activity', title: 'Actividad Reciente', value: [] };
  }
};

/**
 * Get all widgets for a company dashboard
 */
const getAllWidgets = async (
  companyId: number,
  dateFrom: string,
  dateTo: string
): Promise<WidgetData[]> => {
  const [
    usage,
    agents,
    costs,
    resolution,
    trends,
    cache,
    status,
    activity
  ] = await Promise.all([
    getUsageOverview(companyId, dateFrom, dateTo),
    getAgentDistribution(companyId, dateFrom, dateTo),
    getCostBreakdown(companyId, dateFrom, dateTo),
    getResolutionRate(companyId, dateFrom, dateTo),
    getPerformanceTrends(companyId, dateFrom, dateTo),
    getCacheEfficiency(companyId, dateFrom, dateTo),
    getSystemStatus(),
    getRecentActivity(companyId)
  ]);

  return [usage, agents, costs, resolution, trends, cache, status, activity];
};

export default {
  getUsageOverview,
  getAgentDistribution,
  getCostBreakdown,
  getResolutionRate,
  getPerformanceTrends,
  getCacheEfficiency,
  getSystemStatus,
  getTopCompanies,
  getRecentActivity,
  getAllWidgets
};
