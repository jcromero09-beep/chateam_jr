/**
 * HistoricalQARetrieverService — Búsqueda híbrida en AIHistoricalQA
 *
 * Objetivo: recuperar respuestas VERIFICADAS que se hayan dado en OTROS
 * tickets de la misma empresa/producto y que sean compatibles con la
 * pregunta actual (semántica + trigram + filtros por metadata).
 *
 * No decide si aplicar: sólo retorna candidatos. La decisión la toma
 * MemoryJudgeAgent con contexto del ticket actual.
 *
 * Multi-tenant: SIEMPRE filtra por companyId.
 * Frescura: descarta superseded=true y opcionalmente filtra por edad.
 */
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import logger from "../../utils/logger";
import { normalizeQuestion } from "./CurrentTicketMemoryService";

const PREFIX = "[HistoricalQARetriever]";

export interface HistoricalQACandidate {
  id: number;
  question: string;
  normalizedQuestion: string;
  answer: string;
  answerType: "human" | "ai_verified" | "kb_backed" | "tool_backed";
  intent?: string;
  language?: string;
  channel?: string;
  tags?: string[];
  productKey?: string;
  usedCount: number;
  verified: boolean;
  rating?: number;
  createdAt: Date;
  similarity: number;          // semantic, 0..1
  trigramSimilarity: number;   // 0..1 (pg_trgm)
  hybridScore: number;         // combinación
  freshnessDays: number;
}

export interface RetrieveOptions {
  companyId: number;
  currentMessage: string;
  /** Opcional: query enriquecida / HyDE para mejorar recall */
  enrichedQuery?: string;
  hydeQuery?: string;
  /** Filtros de compatibilidad */
  language?: string;
  channel?: string;
  productKey?: string;
  tags?: string[];
  intent?: string;
  /** Umbrales */
  semanticThreshold?: number;  // default 0.72
  trigramThreshold?: number;   // default 0.28
  /** Máx candidatos */
  limit?: number;              // default 5
  /** Descartar filas más viejas que X días (0 = sin límite) */
  maxAgeDays?: number;         // default 180
  /** Solo verified=true */
  onlyVerified?: boolean;      // default true
}

const DEFAULTS = {
  semanticThreshold: 0.72,
  trigramThreshold: 0.28,
  limit: 5,
  maxAgeDays: 180,
  onlyVerified: true,
  // Pesos para hybridScore
  wSemantic: 0.65,
  wTrigram: 0.25,
  wFreshness: 0.10
};

/**
 * Retrieve candidatos. NO aplica. Sólo scoring + filtros.
 */
const retrieve = async (opts: RetrieveOptions): Promise<HistoricalQACandidate[]> => {
  const {
    companyId, currentMessage,
    enrichedQuery, hydeQuery,
    language, channel, productKey, tags, intent,
    semanticThreshold = DEFAULTS.semanticThreshold,
    trigramThreshold = DEFAULTS.trigramThreshold,
    limit = DEFAULTS.limit,
    maxAgeDays = DEFAULTS.maxAgeDays,
    onlyVerified = DEFAULTS.onlyVerified
  } = opts;

  if (!companyId || !currentMessage || currentMessage.trim().length < 3) return [];

  try {
    // Query de embedding: prefer enrichedQuery, luego hyde, luego literal
    const queryForEmbedding = (enrichedQuery && enrichedQuery.length > 3)
      ? enrichedQuery
      : (hydeQuery && hydeQuery.length > 10)
        ? hydeQuery
        : currentMessage;

    let embedding: number[];
    try {
      embedding = await EmbeddingService.generateEmbedding(queryForEmbedding, companyId);
    } catch (e: any) {
      logger.warn(`${PREFIX} embedding falló, degradando a sólo trigram: ${e.message}`);
      embedding = [];
    }

    const normalized = normalizeQuestion(currentMessage);

    // Construcción dinámica de filtros
    const replacements: Record<string, unknown> = {
      companyId,
      semanticThreshold,
      trigramThreshold,
      limit,
      normalized,
      maxAgeDays
    };

    const conds: string[] = [
      `q."companyId" = :companyId`,
      `q.superseded = false`
    ];
    if (onlyVerified) conds.push(`q.verified = true`);
    if (language) { conds.push(`(q.language = :language OR q.language IS NULL)`); replacements.language = language; }
    if (channel)  { conds.push(`(q.channel  = :channel  OR q.channel  IS NULL)`); replacements.channel  = channel; }
    if (productKey) { conds.push(`(q."productKey" = :productKey OR q."productKey" IS NULL)`); replacements.productKey = productKey; }
    if (intent)   { conds.push(`(q.intent = :intent OR q.intent IS NULL)`); replacements.intent = intent; }
    if (tags && tags.length) { conds.push(`q.tags && :tags::text[]`); replacements.tags = tags; }
    if (maxAgeDays > 0) conds.push(`q."createdAt" >= NOW() - (:maxAgeDays || ' days')::interval`);

    // Si hay embedding, usamos ambas métricas en paralelo con CTE; si no, sólo trigram
    let sql: string;
    if (embedding.length > 0) {
      const embeddingStr = `[${embedding.join(",")}]`;
      replacements.embedding = embeddingStr;

      sql = `
        WITH scored AS (
          SELECT
            q.id,
            q.question,
            q."normalizedQuestion",
            q.answer,
            q."answerType",
            q.intent,
            q.language,
            q.channel,
            q.tags,
            q."productKey",
            q."usedCount",
            q.verified,
            q.rating,
            q."createdAt",
            (1 - (q.embedding <=> :embedding::vector)) AS similarity,
            similarity(q."normalizedQuestion", :normalized) AS trigram_similarity,
            EXTRACT(EPOCH FROM (NOW() - q."createdAt")) / 86400.0 AS age_days
          FROM "AIHistoricalQA" q
          WHERE ${conds.join(" AND ")}
            AND q.embedding IS NOT NULL
        )
        SELECT *
        FROM scored
        WHERE similarity >= :semanticThreshold
           OR trigram_similarity >= :trigramThreshold
        ORDER BY (similarity * 0.65 + trigram_similarity * 0.25) DESC
        LIMIT :limit
      `;
    } else {
      sql = `
        SELECT
          q.id, q.question, q."normalizedQuestion", q.answer, q."answerType",
          q.intent, q.language, q.channel, q.tags, q."productKey",
          q."usedCount", q.verified, q.rating, q."createdAt",
          0.0::float AS similarity,
          similarity(q."normalizedQuestion", :normalized) AS trigram_similarity,
          EXTRACT(EPOCH FROM (NOW() - q."createdAt")) / 86400.0 AS age_days
        FROM "AIHistoricalQA" q
        WHERE ${conds.join(" AND ")}
          AND similarity(q."normalizedQuestion", :normalized) >= :trigramThreshold
        ORDER BY trigram_similarity DESC
        LIMIT :limit
      `;
    }

    const rows = await sequelize.query<any>(sql, {
      replacements,
      type: QueryTypes.SELECT
    });

    const candidates: HistoricalQACandidate[] = rows.map(r => {
      const similarity = parseFloat(r.similarity) || 0;
      const trigramSimilarity = parseFloat(r.trigram_similarity) || 0;
      const ageDays = parseFloat(r.age_days) || 0;
      // Freshness: 1 cuando es reciente, cae linealmente a 0 al cumplir maxAgeDays
      const freshness = maxAgeDays > 0
        ? Math.max(0, 1 - (ageDays / maxAgeDays))
        : 1;
      const hybridScore =
        DEFAULTS.wSemantic * similarity +
        DEFAULTS.wTrigram * trigramSimilarity +
        DEFAULTS.wFreshness * freshness;

      return {
        id: Number(r.id),
        question: r.question,
        normalizedQuestion: r.normalizedQuestion,
        answer: r.answer,
        answerType: r.answerType,
        intent: r.intent || undefined,
        language: r.language || undefined,
        channel: r.channel || undefined,
        tags: r.tags || undefined,
        productKey: r.productKey || undefined,
        usedCount: Number(r.usedCount) || 0,
        verified: !!r.verified,
        rating: r.rating != null ? parseFloat(r.rating) : undefined,
        createdAt: new Date(r.createdAt),
        similarity,
        trigramSimilarity,
        hybridScore,
        freshnessDays: ageDays
      };
    });

    logger.info(
      `${PREFIX} ${candidates.length} candidatos (company=${companyId}) ` +
      `best=${candidates[0]?.hybridScore?.toFixed(3) || "-"}`
    );

    return candidates;
  } catch (e: any) {
    logger.error(`${PREFIX} error retrieve: ${e.message}`);
    return [];
  }
};

/**
 * Marca un candidato como REUTILIZADO (actualiza usedCount y lastUsedAt).
 * Llamado cuando el MemoryJudgeAgent decide usarlo.
 */
const markUsed = async (id: number): Promise<void> => {
  try {
    await sequelize.query(
      `UPDATE "AIHistoricalQA"
         SET "usedCount" = "usedCount" + 1, "lastUsedAt" = NOW()
       WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
  } catch (e: any) {
    logger.warn(`${PREFIX} markUsed falló: ${e.message}`);
  }
};

/**
 * Inserta una nueva fila (se llama desde QAExtractorService).
 * El embedding se calcula aquí para no duplicar lógica.
 */
const insert = async (row: {
  companyId: number;
  sourceTicketId?: number;
  sourceMessageId?: number;
  sourceContactId?: number;
  sourceAgentLogId?: number;
  question: string;
  answer: string;
  answerType: "human" | "ai_verified" | "kb_backed" | "tool_backed";
  intent?: string;
  language?: string;
  channel?: string;
  tags?: string[];
  productKey?: string;
  verified?: boolean;
  rating?: number;
  metadata?: Record<string, unknown>;
}): Promise<number | null> => {
  try {
    const normalized = normalizeQuestion(row.question);
    let embedding: number[] = [];
    try {
      embedding = await EmbeddingService.generateEmbedding(row.question, row.companyId);
    } catch (e: any) {
      logger.warn(`${PREFIX} embedding al insertar falló (se inserta sin embedding): ${e.message}`);
    }

    const embeddingSql = embedding.length > 0 ? `:embedding::vector` : `NULL`;

    const [result]: any = await sequelize.query(
      `
      INSERT INTO "AIHistoricalQA"
        ("companyId","sourceTicketId","sourceMessageId","sourceContactId","sourceAgentLogId",
         question,"normalizedQuestion",answer,"answerType",intent,language,channel,tags,"productKey",
         embedding,verified,rating,metadata,"createdAt","updatedAt")
      VALUES
        (:companyId,:sourceTicketId,:sourceMessageId,:sourceContactId,:sourceAgentLogId,
         :question,:normalized,:answer,:answerType,:intent,:language,:channel,:tags,:productKey,
         ${embeddingSql},:verified,:rating,:metadata,NOW(),NOW())
      RETURNING id
      `,
      {
        replacements: {
          companyId: row.companyId,
          sourceTicketId: row.sourceTicketId || null,
          sourceMessageId: row.sourceMessageId || null,
          sourceContactId: row.sourceContactId || null,
          sourceAgentLogId: row.sourceAgentLogId || null,
          question: row.question,
          normalized,
          answer: row.answer,
          answerType: row.answerType,
          intent: row.intent || null,
          language: row.language || "es",
          channel: row.channel || null,
          tags: row.tags || [],
          productKey: row.productKey || null,
          embedding: embedding.length > 0 ? `[${embedding.join(",")}]` : null,
          verified: !!row.verified,
          rating: row.rating ?? null,
          metadata: row.metadata || {}
        },
        type: QueryTypes.INSERT
      }
    );
    // result es array en pg con RETURNING en sequelize.query
    const id = Array.isArray(result) && result[0] ? Number(result[0].id) : null;
    return id;
  } catch (e: any) {
    logger.error(`${PREFIX} insert falló: ${e.message}`);
    return null;
  }
};

/**
 * Marca una fila como obsoleta. Usado cuando se corrige humanamente o se
 * detecta que la respuesta fue contradicha. NO BORRA (BD SAGRADA).
 */
const supersede = async (id: number, replacedBy?: number): Promise<void> => {
  try {
    await sequelize.query(
      `UPDATE "AIHistoricalQA"
         SET superseded = true, "supersededBy" = :replacedBy
       WHERE id = :id`,
      { replacements: { id, replacedBy: replacedBy || null }, type: QueryTypes.UPDATE }
    );
  } catch (e: any) {
    logger.warn(`${PREFIX} supersede falló: ${e.message}`);
  }
};

export default { retrieve, markUsed, insert, supersede };
