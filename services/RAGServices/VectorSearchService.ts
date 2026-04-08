/**
 * VectorSearchService - Busqueda Vectorial con pgvector
 *
 * Servicio de busqueda semantica que utiliza la extension pgvector de PostgreSQL
 * para encontrar chunks de documentos similares a un embedding de consulta.
 *
 * Utiliza el operador de distancia coseno (`<=>`) de pgvector para calcular
 * la similitud entre vectores de 1536 dimensiones.
 *
 * Funcionalidades:
 * - Busqueda por similitud coseno con topK y threshold minimo
 * - Filtrado por companyId (obligatorio) y documentIds (opcional)
 * - Retorna contenido, metadatos, topic y keywords de cada chunk
 *
 * @module RAGServices/VectorSearchService
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[VectorSearchService]";
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.5;

// ============================================================================
// INTERFACES
// ============================================================================

export interface VectorSearchResult {
  chunkId: number;
  documentId: number;
  content: string;
  similarity: number;
  topic?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  topK?: number;
  minSimilarity?: number;
  documentIds?: number[];
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class VectorSearchService {
  /**
   * Busca chunks similares por embedding usando distancia coseno de pgvector
   *
   * @param queryEmbedding - Vector de consulta (1536 dimensiones)
   * @param companyId - ID de la empresa (filtro obligatorio)
   * @param options - Opciones de busqueda (topK, minSimilarity, documentIds)
   * @returns Array de resultados ordenados por similitud descendente
   */
  static async search(
    queryEmbedding: number[],
    companyId: number,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    try {
      const topK = options?.topK ?? DEFAULT_TOP_K;
      const minSimilarity = options?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
      const documentIds = options?.documentIds;

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error(`${SERVICE_PREFIX} Embedding de consulta vacio`);
      }

      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      // Convertir embedding a formato pgvector: '[0.1,0.2,...]'
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // Construir filtro de documentIds si se proporciona
      let documentFilter = "";
      const replacements: Record<string, unknown> = {
        companyId,
        minDistance: 1 - minSimilarity, // Convertir similitud a distancia coseno
        topK,
        embedding: embeddingStr
      };

      if (documentIds && documentIds.length > 0) {
        documentFilter = `AND c."documentId" IN (:documentIds)`;
        replacements.documentIds = documentIds;
      }

      // Query SQL con pgvector - distancia coseno
      // NOTA: pgvector usa distancia (0 = identico), convertimos a similitud (1 = identico)
      const query = `
        SELECT
          c.id AS "chunkId",
          c."documentId",
          c.content,
          (1 - (c.embedding <=> :embedding::vector)) AS similarity,
          c.topic,
          c.keywords,
          c.metadata,
          d.status AS "docStatus"
        FROM "AIChunks" c
        INNER JOIN "AIDocuments" d ON d.id = c."documentId"
        WHERE c."companyId" = :companyId
          AND d.status = 'completed'
          AND c.embedding IS NOT NULL
          AND (1 - (c.embedding <=> :embedding::vector)) >= :minSimilarity
          ${documentFilter}
        ORDER BY c.embedding <=> :embedding::vector ASC
        LIMIT :topK
      `;

      // Reemplazar minDistance por minSimilarity en la query
      replacements.minSimilarity = minSimilarity;

      const results = await sequelize.query<{
        chunkId: number;
        documentId: number;
        content: string;
        similarity: number;
        topic: string | null;
        keywords: string[] | null;
        metadata: Record<string, unknown> | null;
      }>(query, {
        replacements,
        type: QueryTypes.SELECT
      });

      const formattedResults: VectorSearchResult[] = results.map(row => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        content: row.content,
        similarity: parseFloat(String(row.similarity)),
        topic: row.topic || undefined,
        keywords: row.keywords || undefined,
        metadata: row.metadata || undefined
      }));

      logger.info(
        `${SERVICE_PREFIX} Busqueda vectorial: ${formattedResults.length} resultados (topK: ${topK}, minSim: ${minSimilarity}, empresa: ${companyId})`
      );

      // 📊 Debug: mostrar status de documentos encontrados
      if (formattedResults.length === 0) {
        // Verificar si hay chunks con embeddings para esta empresa
        const chunksDebug = await sequelize.query(`
          SELECT d.status, COUNT(*) as total
          FROM "AIChunks" c
          INNER JOIN "AIDocuments" d ON d.id = c."documentId"
          WHERE c."companyId" = :companyId AND c.embedding IS NOT NULL
          GROUP BY d.status
        `, {
          replacements: { companyId },
          type: QueryTypes.SELECT
        });
        logger.debug(`${SERVICE_PREFIX} DEBUG - Chunks por status: ${JSON.stringify(chunksDebug)}`);
      }

      return formattedResults;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en busqueda vectorial: ${errorMsg}`);
      throw error;
    }
  }
}

export default VectorSearchService;
