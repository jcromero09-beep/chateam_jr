import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import AIAgentLog from "../../models/AIAgentLog";
import logger from "../../utils/logger";

/**
 * Servicio para registrar ejecuciones de agentes IA.
 * Cada interacción de un agente genera un log con métricas
 * de tokens, costo, latencia y calidad.
 */

interface LogAgentExecutionRequest {
  companyId: number;
  ticketId?: number;
  contactId?: number;
  agentType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  confidence?: number;
  wasEscalated?: boolean;
  escalationReason?: string;
  cacheHit?: boolean;
  toolsUsed?: string[];
  inputSummary?: string;
  outputSummary?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Registra una ejecución de agente
 */
const logExecution = async (data: LogAgentExecutionRequest): Promise<AIAgentLog> => {
  try {
    const log = await AIAgentLog.create({
      companyId: data.companyId,
      ticketId: data.ticketId || null,
      contactId: data.contactId || null,
      agentType: data.agentType,
      modelUsed: data.modelUsed,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costUsd: data.costUsd,
      latencyMs: data.latencyMs,
      confidence: data.confidence || null,
      wasEscalated: data.wasEscalated || false,
      escalationReason: data.escalationReason || null,
      cacheHit: data.cacheHit || false,
      toolsUsed: data.toolsUsed || [],
      inputSummary: data.inputSummary || null,
      outputSummary: data.outputSummary || null,
      metadata: data.metadata || {}
    } as any);

    return log;
  } catch (error: any) {
    logger.error(`[AgentLogService] Error al registrar log: ${error.message}`);
    throw error;
  }
};

/**
 * Obtiene métricas agregadas de un agente por período
 */
const getAgentMetrics = async (
  companyId: number,
  agentType?: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<any> => {
  const { QueryTypes } = require("sequelize");
  const sequelize = require("../../database").default;

  const whereClause = [];
  const replacements: any = { companyId };

  whereClause.push('"companyId" = :companyId');

  if (agentType) {
    whereClause.push('"agentType" = :agentType');
    replacements.agentType = agentType;
  }

  if (dateFrom) {
    whereClause.push('"createdAt" >= :dateFrom');
    replacements.dateFrom = dateFrom;
  }

  if (dateTo) {
    whereClause.push('"createdAt" <= :dateTo');
    replacements.dateTo = dateTo;
  }

  const where = whereClause.join(" AND ");

  const [metrics] = await sequelize.query(
    `SELECT
      "agentType",
      COUNT(*) as total_executions,
      SUM("inputTokens") as total_input_tokens,
      SUM("outputTokens") as total_output_tokens,
      SUM("costUsd") as total_cost_usd,
      AVG("latencyMs")::INTEGER as avg_latency_ms,
      AVG(confidence)::DECIMAL(3,2) as avg_confidence,
      SUM(CASE WHEN "wasEscalated" = true THEN 1 ELSE 0 END) as escalations,
      SUM(CASE WHEN "cacheHit" = true THEN 1 ELSE 0 END) as cache_hits
    FROM "AIAgentLogs"
    WHERE ${where}
    GROUP BY "agentType"
    ORDER BY total_executions DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  return metrics;
};

export default {
  logExecution,
  getAgentMetrics
};
