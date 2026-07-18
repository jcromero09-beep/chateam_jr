import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

// --- Interfaces ---

interface LatencyStats {
  totalTraces: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

interface ModelUsageItem {
  model: string;
  provider: string;
  spanCount: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

interface AgentPerformanceItem {
  name: string;
  totalCalls: number;
  completedCalls: number;
  errorCalls: number;
  errorRate: number;
  avgLatencyMs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
}

interface ErrorAnalysisItem {
  errorMessage: string;
  occurrences: number;
  lastOccurrence: string;
  affectedModels: string[];
  affectedSpanNames: string[];
}

interface DashboardSummary {
  latency: LatencyStats;
  modelUsage: ModelUsageItem[];
  agentPerformance: AgentPerformanceItem[];
  errors: ErrorAnalysisItem[];
  overview: {
    totalTraces: number;
    completedTraces: number;
    errorTraces: number;
    runningTraces: number;
    totalCostUsd: number;
    totalTokens: number;
    avgCostPerTrace: number;
  };
}

// --- Helpers ---

const getDaysAgoDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

// --- Service Functions ---

/**
 * Calculates latency percentiles (p50, p95, p99) for completed traces
 * using PostgreSQL percentile_cont window functions.
 */
const getLatencyStats = async (
  companyId: number,
  days = 30
): Promise<LatencyStats> => {
  const since = getDaysAgoDate(days);

  const results = await sequelize.query<{
    total_traces: string;
    avg_latency: string;
    p50_latency: string;
    p95_latency: string;
    p99_latency: string;
    min_latency: string;
    max_latency: string;
  }>(`
    SELECT
      COUNT(*)::int AS total_traces,
      COALESCE(AVG("totalLatencyMs"), 0)::decimal(12,2) AS avg_latency,
      COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "totalLatencyMs"), 0)::decimal(12,2) AS p50_latency,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalLatencyMs"), 0)::decimal(12,2) AS p95_latency,
      COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "totalLatencyMs"), 0)::decimal(12,2) AS p99_latency,
      COALESCE(MIN("totalLatencyMs"), 0)::decimal(12,2) AS min_latency,
      COALESCE(MAX("totalLatencyMs"), 0)::decimal(12,2) AS max_latency
    FROM "AITraces"
    WHERE "companyId" = :companyId
      AND "status" = 'completed'
      AND "startedAt" >= :since
  `, {
    replacements: { companyId, since },
    type: QueryTypes.SELECT
  });

  const row = results[0];

  return {
    totalTraces: parseInt(row?.total_traces ?? "0", 10),
    avgLatencyMs: parseFloat(row?.avg_latency ?? "0"),
    p50LatencyMs: parseFloat(row?.p50_latency ?? "0"),
    p95LatencyMs: parseFloat(row?.p95_latency ?? "0"),
    p99LatencyMs: parseFloat(row?.p99_latency ?? "0"),
    minLatencyMs: parseFloat(row?.min_latency ?? "0"),
    maxLatencyMs: parseFloat(row?.max_latency ?? "0")
  };
};

/**
 * Groups span usage by model, returning token counts, cost, and average latency.
 */
const getModelUsage = async (
  companyId: number,
  days = 30
): Promise<ModelUsageItem[]> => {
  const since = getDaysAgoDate(days);

  const results = await sequelize.query<{
    model: string;
    provider: string;
    span_count: string;
    total_tokens_input: string;
    total_tokens_output: string;
    total_tokens: string;
    total_cost: string;
    avg_latency: string;
  }>(`
    SELECT
      COALESCE("model", 'unknown') AS model,
      COALESCE("provider", 'unknown') AS provider,
      COUNT(*)::int AS span_count,
      COALESCE(SUM("tokensInput"), 0)::bigint AS total_tokens_input,
      COALESCE(SUM("tokensOutput"), 0)::bigint AS total_tokens_output,
      COALESCE(SUM("tokensInput") + SUM("tokensOutput"), 0)::bigint AS total_tokens,
      COALESCE(SUM("costUsd"), 0)::decimal(10,6) AS total_cost,
      COALESCE(AVG("latencyMs"), 0)::decimal(12,2) AS avg_latency
    FROM "AISpans"
    WHERE "companyId" = :companyId
      AND "model" IS NOT NULL
      AND "startedAt" >= :since
    GROUP BY "model", "provider"
    ORDER BY total_cost DESC
  `, {
    replacements: { companyId, since },
    type: QueryTypes.SELECT
  });

  return results.map(row => ({
    model: row.model,
    provider: row.provider,
    spanCount: parseInt(row.span_count, 10),
    totalTokensInput: parseInt(row.total_tokens_input, 10),
    totalTokensOutput: parseInt(row.total_tokens_output, 10),
    totalTokens: parseInt(row.total_tokens, 10),
    totalCostUsd: parseFloat(row.total_cost),
    avgLatencyMs: parseFloat(row.avg_latency)
  }));
};

/**
 * Analyzes agent-type spans: call counts, error rates, latency, tokens, cost.
 */
const getAgentPerformance = async (
  companyId: number,
  days = 30
): Promise<AgentPerformanceItem[]> => {
  const since = getDaysAgoDate(days);

  const results = await sequelize.query<{
    name: string;
    total_calls: string;
    completed_calls: string;
    error_calls: string;
    error_rate: string;
    avg_latency: string;
    total_tokens_input: string;
    total_tokens_output: string;
    total_cost: string;
  }>(`
    SELECT
      "name",
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed_calls,
      COUNT(*) FILTER (WHERE "status" = 'error')::int AS error_calls,
      CASE
        WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (WHERE "status" = 'error')::decimal / COUNT(*)::decimal * 100)
        ELSE 0
      END::decimal(5,2) AS error_rate,
      COALESCE(AVG("latencyMs"), 0)::decimal(12,2) AS avg_latency,
      COALESCE(SUM("tokensInput"), 0)::bigint AS total_tokens_input,
      COALESCE(SUM("tokensOutput"), 0)::bigint AS total_tokens_output,
      COALESCE(SUM("costUsd"), 0)::decimal(10,6) AS total_cost
    FROM "AISpans"
    WHERE "companyId" = :companyId
      AND "type" = 'agent'
      AND "startedAt" >= :since
    GROUP BY "name"
    ORDER BY total_calls DESC
  `, {
    replacements: { companyId, since },
    type: QueryTypes.SELECT
  });

  return results.map(row => ({
    name: row.name,
    totalCalls: parseInt(row.total_calls, 10),
    completedCalls: parseInt(row.completed_calls, 10),
    errorCalls: parseInt(row.error_calls, 10),
    errorRate: parseFloat(row.error_rate),
    avgLatencyMs: parseFloat(row.avg_latency),
    totalTokensInput: parseInt(row.total_tokens_input, 10),
    totalTokensOutput: parseInt(row.total_tokens_output, 10),
    totalCostUsd: parseFloat(row.total_cost)
  }));
};

/**
 * Retrieves recent error spans grouped by error message, including
 * affected models and span names.
 */
const getErrorAnalysis = async (
  companyId: number,
  days = 30
): Promise<ErrorAnalysisItem[]> => {
  const since = getDaysAgoDate(days);

  const results = await sequelize.query<{
    error_message: string;
    occurrences: string;
    last_occurrence: string;
    affected_models: string[];
    affected_span_names: string[];
  }>(`
    SELECT
      "errorMessage" AS error_message,
      COUNT(*)::int AS occurrences,
      MAX("completedAt")::text AS last_occurrence,
      ARRAY_AGG(DISTINCT "model") FILTER (WHERE "model" IS NOT NULL) AS affected_models,
      ARRAY_AGG(DISTINCT "name") AS affected_span_names
    FROM "AISpans"
    WHERE "companyId" = :companyId
      AND "status" = 'error'
      AND "errorMessage" IS NOT NULL
      AND "startedAt" >= :since
    GROUP BY "errorMessage"
    ORDER BY occurrences DESC
    LIMIT 50
  `, {
    replacements: { companyId, since },
    type: QueryTypes.SELECT
  });

  return results.map(row => ({
    errorMessage: row.error_message,
    occurrences: parseInt(row.occurrences, 10),
    lastOccurrence: row.last_occurrence,
    affectedModels: row.affected_models ?? [],
    affectedSpanNames: row.affected_span_names ?? []
  }));
};

/**
 * Combines all performance metrics into a single dashboard response.
 */
const getDashboardSummary = async (
  companyId: number
): Promise<DashboardSummary> => {
  const days = 30;

  // Run all queries in parallel for maximum performance
  const [latency, modelUsage, agentPerformance, errors, overviewResults] =
    await Promise.all([
      getLatencyStats(companyId, days),
      getModelUsage(companyId, days),
      getAgentPerformance(companyId, days),
      getErrorAnalysis(companyId, days),
      sequelize.query<{
        total_traces: string;
        completed_traces: string;
        error_traces: string;
        running_traces: string;
        total_cost: string;
        total_tokens: string;
        avg_cost: string;
      }>(`
        SELECT
          COUNT(*)::int AS total_traces,
          COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed_traces,
          COUNT(*) FILTER (WHERE "status" = 'error')::int AS error_traces,
          COUNT(*) FILTER (WHERE "status" = 'running')::int AS running_traces,
          COALESCE(SUM("totalCostUsd"), 0)::decimal(10,6) AS total_cost,
          COALESCE(SUM("totalTokensInput") + SUM("totalTokensOutput"), 0)::bigint AS total_tokens,
          CASE
            WHEN COUNT(*) FILTER (WHERE "status" = 'completed') > 0
            THEN (COALESCE(SUM("totalCostUsd"), 0) / COUNT(*) FILTER (WHERE "status" = 'completed'))::decimal(10,6)
            ELSE 0
          END AS avg_cost
        FROM "AITraces"
        WHERE "companyId" = :companyId
          AND "startedAt" >= :since
      `, {
        replacements: { companyId, since: getDaysAgoDate(days) },
        type: QueryTypes.SELECT
      })
    ]);

  const ov = overviewResults[0];

  return {
    latency,
    modelUsage,
    agentPerformance,
    errors,
    overview: {
      totalTraces: parseInt(ov?.total_traces ?? "0", 10),
      completedTraces: parseInt(ov?.completed_traces ?? "0", 10),
      errorTraces: parseInt(ov?.error_traces ?? "0", 10),
      runningTraces: parseInt(ov?.running_traces ?? "0", 10),
      totalCostUsd: parseFloat(ov?.total_cost ?? "0"),
      totalTokens: parseInt(ov?.total_tokens ?? "0", 10),
      avgCostPerTrace: parseFloat(ov?.avg_cost ?? "0")
    }
  };
};

export default {
  getLatencyStats,
  getModelUsage,
  getAgentPerformance,
  getErrorAnalysis,
  getDashboardSummary
};
