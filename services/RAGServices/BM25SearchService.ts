/**
 * BM25SearchService - Full-Text Search con tsvector/tsquery
 *
 * Servicio de busqueda full-text que utiliza las capacidades nativas de
 * PostgreSQL (tsvector, tsquery, ts_rank, ts_headline) para encontrar
 * chunks de documentos relevantes por texto completo.
 *
 * Soporta configuracion de idioma (spanish/english) para stemming,
 * stop words y normalizacion linguistica adecuada.
 *
 * Funcionalidades:
 * - Busqueda full-text con ranking BM25 (ts_rank)
 * - Generacion de headlines con fragmentos destacados
 * - Soporte multi-idioma (spanish por defecto)
 * - Filtrado por companyId (obligatorio)
 *
 * @module RAGServices/BM25SearchService
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[BM25SearchService]";
const DEFAULT_TOP_K = 10;
const DEFAULT_LANGUAGE = "spanish";
const SUPPORTED_LANGUAGES = ["spanish", "english", "portuguese", "french", "german", "italian"];

// ============================================================================
// INTERFACES
// ============================================================================

export interface BM25SearchResult {
  chunkId: number;
  documentId: number;
  content: string;
  rank: number;
  headline?: string;
}

export interface BM25SearchOptions {
  topK?: number;
  language?: string;
}

// ============================================================================
// UTILIDADES INTERNAS
// ============================================================================

/**
 * Sanitiza la query de busqueda para evitar inyeccion SQL en tsquery.
 * Convierte texto libre en formato compatible con plainto_tsquery.
 */
function sanitizeQuery(query: string): string {
  return query
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/g, " ") // Eliminar caracteres especiales excepto acentos
    .replace(/\s+/g, " ")                       // Multiples espacios a uno
    .trim();
}

/**
 * Valida el idioma de configuracion de tsvector
 */
function validateLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }
  logger.warn(`${SERVICE_PREFIX} Idioma '${lang}' no soportado, usando '${DEFAULT_LANGUAGE}'`);
  return DEFAULT_LANGUAGE;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class BM25SearchService {
  /**
   * Busca chunks por texto completo usando tsvector/tsquery de PostgreSQL
   *
   * Utiliza plainto_tsquery para convertir el texto libre en una consulta
   * de busqueda full-text, ts_rank para calcular relevancia, y ts_headline
   * para generar fragmentos destacados del contenido.
   *
   * @param query - Texto de busqueda en lenguaje natural
   * @param companyId - ID de la empresa (filtro obligatorio)
   * @param options - Opciones de busqueda (topK, language)
   * @returns Array de resultados ordenados por ranking descendente
   */
  static async search(
    query: string,
    companyId: number,
    options?: BM25SearchOptions
  ): Promise<BM25SearchResult[]> {
    try {
      const topK = options?.topK ?? DEFAULT_TOP_K;
      const language = validateLanguage(options?.language ?? DEFAULT_LANGUAGE);

      if (!query || query.trim().length === 0) {
        logger.warn(`${SERVICE_PREFIX} Query de busqueda vacia, retornando array vacio`);
        return [];
      }

      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      const sanitizedQuery = sanitizeQuery(query);
      if (sanitizedQuery.length === 0) {
        logger.warn(`${SERVICE_PREFIX} Query sanitizada resulto vacia, retornando array vacio`);
        return [];
      }

      // Query SQL con full-text search de PostgreSQL
      // Usa plainto_tsquery para busqueda en lenguaje natural
      // ts_rank para scoring y ts_headline para fragmentos destacados
      const sqlQuery = `
        SELECT
          c.id AS "chunkId",
          c."documentId",
          c.content,
          ts_rank(
            to_tsvector(:language::regconfig, c.content),
            plainto_tsquery(:language::regconfig, :query)
          ) AS rank,
          ts_headline(
            :language::regconfig,
            c.content,
            plainto_tsquery(:language::regconfig, :query),
            'StartSel=<b>, StopSel=</b>, MaxWords=50, MinWords=20, MaxFragments=2, FragmentDelimiter= ... '
          ) AS headline
        FROM "AIChunks" c
        INNER JOIN "AIDocuments" d ON d.id = c."documentId"
        WHERE c."companyId" = :companyId
          AND d.status = 'completed'
          AND to_tsvector(:language::regconfig, c.content) @@ plainto_tsquery(:language::regconfig, :query)
        ORDER BY rank DESC
        LIMIT :topK
      `;

      const results = await sequelize.query<{
        chunkId: number;
        documentId: number;
        content: string;
        rank: number;
        headline: string | null;
      }>(sqlQuery, {
        replacements: {
          language,
          query: sanitizedQuery,
          companyId,
          topK
        },
        type: QueryTypes.SELECT
      });

      const formattedResults: BM25SearchResult[] = results.map(row => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        content: row.content,
        rank: parseFloat(String(row.rank)),
        headline: row.headline || undefined
      }));

      logger.info(
        `${SERVICE_PREFIX} Busqueda full-text: ${formattedResults.length} resultados (idioma: ${language}, topK: ${topK}, empresa: ${companyId})`
      );

      return formattedResults;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en busqueda full-text: ${errorMsg}`);
      throw error;
    }
  }
}

export default BM25SearchService;
