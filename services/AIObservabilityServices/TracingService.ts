import crypto from "crypto";
import { Op, WhereOptions } from "sequelize";
import AITrace from "../../models/AITrace";
import AISpan from "../../models/AISpan";
import logger from "../../utils/logger";

// --- Interfaces ---

interface CreateTraceData {
  name: string;
  sessionId?: string;
  userId?: number;
  ticketId?: number;
  contactId?: number;
  input?: Record<string, unknown>;
  tags?: string[];
}

interface CompleteTraceData {
  output?: Record<string, unknown>;
  status?: "completed" | "error";
  totalTokensInput?: number;
  totalTokensOutput?: number;
  totalCostUsd?: number;
}

interface CreateSpanData {
  name: string;
  type: "llm" | "retrieval" | "tool" | "agent" | "embedding" | "reranking" | "guard" | "custom";
  parentSpanId?: string;
  model?: string;
  provider?: string;
  input?: Record<string, unknown>;
}

interface CompleteSpanData {
  output?: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
  status?: "completed" | "error";
  errorMessage?: string;
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
}

interface ListTracesFilters {
  status?: string;
  name?: string;
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface PaginatedTraces {
  traces: AITrace[];
  total: number;
  limit: number;
  offset: number;
}

// --- Service Functions ---

/**
 * Creates a new trace with a generated UUID traceId.
 */
const createTrace = async (
  companyId: number,
  data: CreateTraceData
): Promise<AITrace> => {
  const traceId = crypto.randomUUID();
  const now = new Date();

  const trace = await AITrace.create({
    companyId,
    traceId,
    name: data.name,
    sessionId: data.sessionId ?? null,
    userId: data.userId ?? null,
    ticketId: data.ticketId ?? null,
    contactId: data.contactId ?? null,
    input: data.input ?? {},
    tags: data.tags ?? [],
    status: "running",
    startedAt: now
  } as AITrace);

  logger.info(
    `[AIObservability] Trace created: ${traceId} | name=${data.name} | company=${companyId}`
  );

  return trace;
};

/**
 * Completes a trace by updating output, status, token counts, cost,
 * and calculating total latency from startedAt to now.
 */
const completeTrace = async (
  traceId: string,
  data: CompleteTraceData
): Promise<AITrace> => {
  const trace = await AITrace.findOne({ where: { traceId } });

  if (!trace) {
    throw new Error(`Trace not found: ${traceId}`);
  }

  const completedAt = new Date();
  const latencyMs = trace.startedAt
    ? completedAt.getTime() - new Date(trace.startedAt).getTime()
    : 0;

  await trace.update({
    output: data.output ?? trace.output,
    status: data.status ?? "completed",
    totalTokensInput: data.totalTokensInput ?? trace.totalTokensInput,
    totalTokensOutput: data.totalTokensOutput ?? trace.totalTokensOutput,
    totalCostUsd: data.totalCostUsd ?? trace.totalCostUsd,
    totalLatencyMs: latencyMs,
    completedAt
  });

  logger.info(
    `[AIObservability] Trace completed: ${traceId} | status=${trace.status} | latency=${latencyMs}ms`
  );

  return trace;
};

/**
 * Creates a new span within a trace, with a generated UUID spanId.
 */
const createSpan = async (
  traceId: string,
  companyId: number,
  data: CreateSpanData
): Promise<AISpan> => {
  const spanId = crypto.randomUUID();
  const now = new Date();

  const span = await AISpan.create({
    traceId,
    spanId,
    companyId,
    name: data.name,
    type: data.type,
    parentSpanId: data.parentSpanId ?? null,
    model: data.model ?? null,
    provider: data.provider ?? null,
    input: data.input ?? {},
    status: "running",
    startedAt: now
  } as AISpan);

  logger.info(
    `[AIObservability] Span created: ${spanId} | trace=${traceId} | name=${data.name} | type=${data.type}`
  );

  return span;
};

/**
 * Completes a span by updating output, tokens, cost, status,
 * and calculating latency from startedAt to now.
 */
const completeSpan = async (
  spanId: string,
  data: CompleteSpanData
): Promise<AISpan> => {
  const span = await AISpan.findOne({ where: { spanId } });

  if (!span) {
    throw new Error(`Span not found: ${spanId}`);
  }

  const completedAt = new Date();
  const latencyMs = span.startedAt
    ? completedAt.getTime() - new Date(span.startedAt).getTime()
    : 0;

  await span.update({
    output: data.output ?? span.output,
    tokensInput: data.tokensInput ?? span.tokensInput,
    tokensOutput: data.tokensOutput ?? span.tokensOutput,
    costUsd: data.costUsd ?? span.costUsd,
    status: data.status ?? "completed",
    errorMessage: data.errorMessage ?? span.errorMessage,
    level: data.level ?? span.level,
    latencyMs,
    completedAt
  });

  logger.info(
    `[AIObservability] Span completed: ${spanId} | status=${span.status} | latency=${latencyMs}ms`
  );

  return span;
};

/**
 * Retrieves a single trace with all its spans, filtered by companyId.
 */
const getTrace = async (
  traceId: string,
  companyId: number
): Promise<AITrace | null> => {
  const trace = await AITrace.findOne({
    where: { traceId, companyId },
    include: [
      {
        model: AISpan,
        as: "spans",
        required: false,
        order: [["startedAt", "ASC"]]
      }
    ],
    order: [[{ model: AISpan, as: "spans" }, "startedAt", "ASC"]]
  });

  return trace;
};

/**
 * Lists traces for a company with pagination and filters.
 */
const listTraces = async (
  companyId: number,
  filters: ListTracesFilters
): Promise<PaginatedTraces> => {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const where: WhereOptions = { companyId };

  if (filters.status) {
    (where as Record<string, unknown>).status = filters.status;
  }

  if (filters.name) {
    (where as Record<string, unknown>).name = {
      [Op.iLike]: `%${filters.name}%`
    };
  }

  if (filters.sessionId) {
    (where as Record<string, unknown>).sessionId = filters.sessionId;
  }

  if (filters.startDate || filters.endDate) {
    const dateFilter: Record<symbol, Date> = {};
    if (filters.startDate) {
      dateFilter[Op.gte] = new Date(filters.startDate);
    }
    if (filters.endDate) {
      dateFilter[Op.lte] = new Date(filters.endDate);
    }
    (where as Record<string, unknown>).startedAt = dateFilter;
  }

  if (filters.tags && filters.tags.length > 0) {
    (where as Record<string, unknown>).tags = {
      [Op.overlap]: filters.tags
    };
  }

  const { rows: traces, count: total } = await AITrace.findAndCountAll({
    where,
    limit,
    offset,
    order: [["startedAt", "DESC"]],
    include: [
      {
        model: AISpan,
        as: "spans",
        required: false
      }
    ]
  });

  return { traces, total, limit, offset };
};

export default {
  createTrace,
  completeTrace,
  createSpan,
  completeSpan,
  getTrace,
  listTraces
};
