import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import sequelize from "../database";
import { calculateTokenCostUsd, normalizePricingModel } from "../services/TokenTrackingService/AITokenPricingService";

type QueryFilters = {
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  model?: string;
  search?: string;
};

const MODEL_SQL = `COALESCE(t.meta->>'model', t."referenceId", 'unknown')`;
const PROMPT_SQL = `CASE WHEN COALESCE(t.meta->>'promptTokens', '') ~ '^[0-9]+$' THEN (t.meta->>'promptTokens')::bigint ELSE 0 END`;
const COMPLETION_SQL = `CASE WHEN COALESCE(t.meta->>'completionTokens', '') ~ '^[0-9]+$' THEN (t.meta->>'completionTokens')::bigint ELSE 0 END`;

const buildUsageWhere = (filters: QueryFilters) => {
  const clauses = [`t.type = 'usage'`];
  const replacements: Record<string, string | number> = {};

  if (filters.companyId && Number.isInteger(Number(filters.companyId))) {
    clauses.push(`t."companyId" = :companyId`);
    replacements.companyId = Number(filters.companyId);
  }
  if (filters.dateFrom) {
    clauses.push(`t."createdAt" >= :dateFrom`);
    replacements.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    clauses.push(`t."createdAt" < :dateTo`);
    replacements.dateTo = filters.dateTo;
  }
  if (filters.module) {
    clauses.push(`t.module = :module`);
    replacements.module = filters.module;
  }
  if (filters.model) {
    clauses.push(`${MODEL_SQL} = :model`);
    replacements.model = filters.model;
  }
  if (filters.search?.trim()) {
    clauses.push(`(
      c.name ILIKE :search OR
      COALESCE(t.module, '') ILIKE :search OR
      ${MODEL_SQL} ILIKE :search OR
      COALESCE(t."referenceId", '') ILIKE :search OR
      COALESCE(t.description, '') ILIKE :search
    )`);
    replacements.search = `%${filters.search.trim()}%`;
  }

  return { whereSql: clauses.join(" AND "), replacements };
};

const toNumber = (value: unknown): number => Number(value || 0);

export const index = async (req: Request, res: Response): Promise<Response> => {
  const filters = req.query as QueryFilters & { page?: string; limit?: string };
  const page = Math.max(1, Number.parseInt(filters.page || "1", 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(filters.limit || "25", 10) || 25));
  const offset = (page - 1) * limit;
  const { whereSql, replacements } = buildUsageWhere(filters);

  const [rows, countRows, groupedCosts, grantedRows] = await Promise.all([
    sequelize.query<any>(`
      SELECT
        t.id,
        t."createdAt",
        t."companyId",
        c.name AS "companyName",
        t.module,
        ${MODEL_SQL} AS model,
        ${PROMPT_SQL} AS "promptTokens",
        ${COMPLETION_SQL} AS "completionTokens",
        ABS(t.tokens)::bigint AS "totalTokens",
        COALESCE(t."amountUsd", 0)::numeric AS "storedCostUsd",
        t."balanceAfter",
        t."referenceId",
        t.description
      FROM "AiTokenTransactions" t
      INNER JOIN "Companies" c ON c.id = t."companyId"
      WHERE ${whereSql}
      ORDER BY t."createdAt" DESC, t.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit, offset }
    }),
    sequelize.query<{ total: string }>(`
      SELECT COUNT(*)::bigint AS total
      FROM "AiTokenTransactions" t
      INNER JOIN "Companies" c ON c.id = t."companyId"
      WHERE ${whereSql}
    `, { type: QueryTypes.SELECT, replacements }),
    sequelize.query<any>(`
      SELECT
        ${MODEL_SQL} AS model,
        SUM(${PROMPT_SQL})::bigint AS "promptTokens",
        SUM(${COMPLETION_SQL})::bigint AS "completionTokens",
        SUM(ABS(t.tokens))::bigint AS "totalTokens",
        COUNT(*)::bigint AS requests
      FROM "AiTokenTransactions" t
      INNER JOIN "Companies" c ON c.id = t."companyId"
      WHERE ${whereSql}
      GROUP BY ${MODEL_SQL}
    `, { type: QueryTypes.SELECT, replacements }),
    sequelize.query<{ grantedTokens: string }>(`
      SELECT COALESCE(SUM(t.tokens), 0)::bigint AS "grantedTokens"
      FROM "AiTokenTransactions" t
      WHERE t.tokens > 0
        AND t.type IN ('purchase', 'bonus', 'adjust', 'refund')
        ${replacements.companyId ? `AND t."companyId" = :companyId` : ""}
        ${replacements.dateFrom ? `AND t."createdAt" >= :dateFrom` : ""}
        ${replacements.dateTo ? `AND t."createdAt" < :dateTo` : ""}
    `, { type: QueryTypes.SELECT, replacements })
  ]);

  const data = rows.map(row => {
    const promptTokens = toNumber(row.promptTokens);
    const completionTokens = toNumber(row.completionTokens);
    const estimatedCostUsd = calculateTokenCostUsd(row.model, promptTokens, completionTokens);

    return {
      ...row,
      promptTokens,
      completionTokens,
      totalTokens: toNumber(row.totalTokens),
      storedCostUsd: toNumber(row.storedCostUsd),
      estimatedCostUsd,
      pricingModel: normalizePricingModel(row.model),
      balanceAfter: row.balanceAfter === null ? null : toNumber(row.balanceAfter)
    };
  });

  const summary = groupedCosts.reduce((acc, group) => {
    const promptTokens = toNumber(group.promptTokens);
    const completionTokens = toNumber(group.completionTokens);
    acc.totalTokens += toNumber(group.totalTokens);
    acc.totalRequests += toNumber(group.requests);
    acc.totalCostUsd += calculateTokenCostUsd(group.model, promptTokens, completionTokens);
    return acc;
  }, { totalTokens: 0, totalRequests: 0, totalCostUsd: 0 });

  const total = toNumber(countRows[0]?.total);

  return res.json({
    rows: data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    },
    summary: {
      ...summary,
      grantedTokens: toNumber(grantedRows[0]?.grantedTokens),
      averageTokensPerRequest: summary.totalRequests > 0
        ? summary.totalTokens / summary.totalRequests
        : 0
    }
  });
};

export const filterOptions = async (_req: Request, res: Response): Promise<Response> => {
  const [companies, modules, models] = await Promise.all([
    sequelize.query<{ id: number; name: string }>(`
      SELECT id, name FROM "Companies" ORDER BY name ASC, id ASC
    `, { type: QueryTypes.SELECT }),
    sequelize.query<{ value: string }>(`
      SELECT DISTINCT module AS value
      FROM "AiTokenTransactions"
      WHERE type = 'usage' AND module IS NOT NULL AND module <> ''
      ORDER BY value ASC
    `, { type: QueryTypes.SELECT }),
    sequelize.query<{ value: string }>(`
      SELECT DISTINCT ${MODEL_SQL} AS value
      FROM "AiTokenTransactions" t
      WHERE t.type = 'usage'
      ORDER BY value ASC
    `, { type: QueryTypes.SELECT })
  ]);

  return res.json({
    companies,
    modules: modules.map(item => item.value),
    models: models.map(item => item.value)
  });
};
