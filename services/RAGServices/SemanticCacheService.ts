/**
 * SemanticCacheService - Cache Semantico con pgvector
 *
 * Servicio de cache inteligente que utiliza similitud semantica para
 * encontrar respuestas previamente generadas que sean relevantes a
 * nuevas consultas, evitando llamadas redundantes a la API de LLM.
 *
 * Utiliza pgvector para almacenar y buscar embeddings de consultas,
 * con un threshold de similitud alto (0.95) para garantizar que solo
 * se retornen respuestas verdaderamente equivalentes.
 *
 * Tabla: AISemanticCache (creada via migracion SQL raw por pgvector)
 *
 * Funcionalidades:
 * - Lookup por similitud semantica con threshold configurable
 * - Almacenamiento de respuestas con embedding y metadata
 * - TTL de 24 horas con limpieza automatica
 * - Conteo de hits para metricas de efectividad
 * - Tracking de costos evitados
 *
 * @module RAGServices/SemanticCacheService
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";
import EmbeddingService from "./EmbeddingService";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[SemanticCacheService]";
const DEFAULT_SIMILARITY_THRESHOLD = 0.95;
const DEFAULT_TTL_HOURS = 24;
const TABLE_NAME = "AISemanticCache";

// ============================================================================
// INTERFACES
// ============================================================================

export interface CacheEntry {
  queryText: string;
  response: string;
  modelUsed: string;
  agentUsed?: string;
}

export interface CacheStoreMeta {
  modelUsed: string;
  agentUsed?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class SemanticCacheService {
  /**
   * Busca respuesta en cache por similitud semantica
   *
   * Compara el embedding de la query con los embeddings almacenados
   * en el cache. Solo retorna un resultado si la similitud supera
   * el threshold configurado (default: 0.95).
   *
   * @param query - Texto de la consulta
   * @param companyId - ID de la empresa
   * @param threshold - Umbral de similitud (default: 0.95)
   * @returns Entrada de cache si se encuentra, null en caso contrario
   */
  static async lookup(
    query: string,
    companyId: number,
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD
  ): Promise<CacheEntry | null> {
    try {
      if (!query || query.trim().length === 0) {
        return null;
      }

      // Generar embedding de la query
      const queryEmbedding = await EmbeddingService.generateEmbedding(query, companyId);
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // Buscar en cache con similitud semantica
      const sqlQuery = `
        SELECT
          id,
          "queryText",
          response,
          "modelUsed",
          "agentUsed",
          (1 - ("queryEmbedding" <=> :queryEmbedding::vector)) AS similarity
        FROM "${TABLE_NAME}"
        WHERE "companyId" = :companyId
          AND "expiresAt" > NOW()
          AND (1 - ("queryEmbedding" <=> :queryEmbedding::vector)) >= :threshold
        ORDER BY "queryEmbedding" <=> :queryEmbedding::vector ASC
        LIMIT 1
      `;

      const results = await sequelize.query<{
        id: number;
        queryText: string;
        response: string;
        modelUsed: string;
        agentUsed: string | null;
        similarity: number;
      }>(sqlQuery, {
        replacements: {
          queryEmbedding: embeddingStr,
          companyId,
          threshold
        },
        type: QueryTypes.SELECT
      });

      if (results.length === 0) {
        logger.info(`${SERVICE_PREFIX} Cache MISS (empresa: ${companyId})`);
        return null;
      }

      const hit = results[0];

      // Incrementar hit count en background (no bloquear la respuesta)
      SemanticCacheService.incrementHitCount(hit.id).catch(err => {
        logger.warn(`${SERVICE_PREFIX} Error incrementando hit count: ${err}`);
      });

      logger.info(
        `${SERVICE_PREFIX} Cache HIT (similitud: ${parseFloat(String(hit.similarity)).toFixed(4)}, empresa: ${companyId})`
      );

      return {
        queryText: hit.queryText,
        response: hit.response,
        modelUsed: hit.modelUsed,
        agentUsed: hit.agentUsed || undefined
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en lookup de cache: ${errorMsg}`);
      // En caso de error, retornar null para que el sistema continue sin cache
      return null;
    }
  }

  /**
   * Almacena una respuesta en el cache semantico
   *
   * @param query - Texto original de la consulta
   * @param queryEmbedding - Embedding pre-calculado de la query
   * @param response - Respuesta generada por el LLM
   * @param companyId - ID de la empresa
   * @param meta - Metadata de la generacion (modelo, tokens, costo)
   */
  static async store(
    query: string,
    queryEmbedding: number[],
    response: string,
    companyId: number,
    meta: CacheStoreMeta
  ): Promise<void> {
    try {
      if (!query || !response || !queryEmbedding || queryEmbedding.length === 0) {
        logger.warn(`${SERVICE_PREFIX} Datos incompletos para almacenar en cache, omitiendo`);
        return;
      }

      const embeddingStr = `[${queryEmbedding.join(",")}]`;
      const ttlHours = Number(process.env.RAG_CACHE_TTL_HOURS) || DEFAULT_TTL_HOURS;

      const insertQuery = `
        INSERT INTO "${TABLE_NAME}" (
          "companyId",
          "queryText",
          "queryEmbedding",
          response,
          "modelUsed",
          "agentUsed",
          "tokensInput",
          "tokensOutput",
          "costUsd",
          "hitCount",
          "expiresAt",
          "createdAt"
        ) VALUES (
          :companyId,
          :queryText,
          :queryEmbedding::vector,
          :response,
          :modelUsed,
          :agentUsed,
          :tokensInput,
          :tokensOutput,
          :costUsd,
          0,
          NOW() + INTERVAL '${ttlHours} hours',
          NOW()
        )
      `;

      await sequelize.query(insertQuery, {
        replacements: {
          companyId,
          queryText: query,
          queryEmbedding: embeddingStr,
          response,
          modelUsed: meta.modelUsed,
          agentUsed: meta.agentUsed || null,
          tokensInput: meta.tokensInput,
          tokensOutput: meta.tokensOutput,
          costUsd: meta.costUsd
        },
        type: QueryTypes.INSERT
      });

      logger.info(
        `${SERVICE_PREFIX} Respuesta almacenada en cache (modelo: ${meta.modelUsed}, costo: $${meta.costUsd.toFixed(6)}, TTL: ${ttlHours}h, empresa: ${companyId})`
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error almacenando en cache: ${errorMsg}`);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Limpia entradas de cache expiradas
   *
   * @returns Cantidad de entradas eliminadas
   */
  static async cleanup(): Promise<number> {
    try {
      const deleteQuery = `
        DELETE FROM "${TABLE_NAME}"
        WHERE "expiresAt" <= NOW()
        RETURNING id
      `;

      const [results] = await sequelize.query(deleteQuery, {
        type: QueryTypes.SELECT
      });

      // Contar filas eliminadas
      const countQuery = `
        DELETE FROM "${TABLE_NAME}"
        WHERE "expiresAt" <= NOW()
      `;

      const [, metadata] = await sequelize.query(countQuery);
      const deletedCount = (metadata as { rowCount?: number })?.rowCount || 0;

      if (deletedCount > 0) {
        logger.info(`${SERVICE_PREFIX} Cache limpiado: ${deletedCount} entradas expiradas eliminadas`);
      }

      return deletedCount;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error limpiando cache: ${errorMsg}`);
      return 0;
    }
  }

  /**
   * Incrementa el contador de hits de una entrada de cache
   *
   * @param cacheId - ID de la entrada de cache
   */
  private static async incrementHitCount(cacheId: number): Promise<void> {
    try {
      await sequelize.query(
        `UPDATE "${TABLE_NAME}" SET "hitCount" = "hitCount" + 1, "lastHitAt" = NOW() WHERE id = :cacheId`,
        {
          replacements: { cacheId },
          type: QueryTypes.UPDATE
        }
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`${SERVICE_PREFIX} Error incrementando hitCount para cache ${cacheId}: ${errorMsg}`);
    }
  }

  /**
   * Obtiene estadisticas del cache por empresa
   *
   * @param companyId - ID de la empresa
   * @returns Estadisticas del cache
   */
  static async getStats(companyId: number): Promise<{
    totalEntries: number;
    totalHits: number;
    totalCostSaved: number;
    avgSimilarity: number;
  }> {
    try {
      const statsQuery = `
        SELECT
          COUNT(*) AS "totalEntries",
          COALESCE(SUM("hitCount"), 0) AS "totalHits",
          COALESCE(SUM("costUsd" * "hitCount"), 0) AS "totalCostSaved"
        FROM "${TABLE_NAME}"
        WHERE "companyId" = :companyId
          AND "expiresAt" > NOW()
      `;

      const results = await sequelize.query<{
        totalEntries: string;
        totalHits: string;
        totalCostSaved: string;
      }>(statsQuery, {
        replacements: { companyId },
        type: QueryTypes.SELECT
      });

      const row = results[0];
      return {
        totalEntries: parseInt(row?.totalEntries || "0", 10),
        totalHits: parseInt(row?.totalHits || "0", 10),
        totalCostSaved: parseFloat(row?.totalCostSaved || "0"),
        avgSimilarity: 0 // Se calcula en consultas mas especificas si se necesita
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error obteniendo estadisticas de cache: ${errorMsg}`);
      return { totalEntries: 0, totalHits: 0, totalCostSaved: 0, avgSimilarity: 0 };
    }
  }
}

export default SemanticCacheService;
