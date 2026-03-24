/**
 * HybridSearchService - Fusion de Resultados con Reciprocal Rank Fusion (RRF)
 *
 * Servicio que combina los resultados de busqueda vectorial (semantica) y
 * busqueda full-text (BM25) usando el algoritmo Reciprocal Rank Fusion.
 *
 * El RRF es un metodo de fusion que no requiere normalizacion de scores
 * entre diferentes sistemas de ranking. La formula es:
 *   RRF_score = SUM(1 / (k + rank_i)) para cada sistema de ranking
 *
 * Funcionalidades:
 * - Busqueda hibrida combinando vector + BM25
 * - Pesos configurables para cada fuente (vectorWeight, bm25Weight)
 * - Deduplicacion por chunkId
 * - Preservacion de scores individuales para debugging
 *
 * @module RAGServices/HybridSearchService
 */

import logger from "../../utils/logger";
import EmbeddingService from "./EmbeddingService";
import VectorSearchService, { VectorSearchResult } from "./VectorSearchService";
import BM25SearchService, { BM25SearchResult } from "./BM25SearchService";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[HybridSearchService]";
const DEFAULT_TOP_K = 5;
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_BM25_WEIGHT = 0.4;
const DEFAULT_RRF_K = 60; // Constante k en la formula RRF (estandar: 60)

// ============================================================================
// INTERFACES
// ============================================================================

export interface HybridSearchResult {
  chunkId: number;
  documentId: number;
  content: string;
  combinedScore: number;
  vectorScore?: number;
  bm25Score?: number;
  topic?: string;
  keywords?: string[];
}

export interface HybridSearchOptions {
  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  documentIds?: number[];
  language?: string;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class HybridSearchService {
  /**
   * Busca usando busqueda vectorial + BM25 con fusion RRF
   *
   * Ejecuta ambas busquedas en paralelo, luego fusiona los resultados
   * usando Reciprocal Rank Fusion con pesos configurables.
   *
   * @param query - Texto de busqueda en lenguaje natural
   * @param companyId - ID de la empresa (filtro obligatorio)
   * @param options - Opciones de busqueda (topK, vectorWeight, bm25Weight)
   * @returns Array de resultados fusionados ordenados por score combinado
   */
  static async search(
    query: string,
    companyId: number,
    options?: HybridSearchOptions
  ): Promise<HybridSearchResult[]> {
    try {
      const topK = options?.topK ?? DEFAULT_TOP_K;
      const vectorWeight = options?.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
      const bm25Weight = options?.bm25Weight ?? DEFAULT_BM25_WEIGHT;

      if (!query || query.trim().length === 0) {
        logger.warn(`${SERVICE_PREFIX} Query vacia, retornando array vacio`);
        return [];
      }

      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      // Paso 1: Generar embedding de la query
      const queryEmbedding = await EmbeddingService.generateEmbedding(query, companyId);

      // Paso 2: Ejecutar busqueda vectorial y BM25 en paralelo
      // Pedimos mas resultados a cada fuente para mejor cobertura en la fusion
      const fetchTopK = Math.max(topK * 3, 15);

      const [vectorResults, bm25Results] = await Promise.all([
        VectorSearchService.search(queryEmbedding, companyId, {
          topK: fetchTopK,
          minSimilarity: 0.3, // Umbral mas bajo para capturar mas candidatos
          documentIds: options?.documentIds
        }),
        BM25SearchService.search(query, companyId, {
          topK: fetchTopK,
          language: options?.language
        })
      ]);

      logger.info(
        `${SERVICE_PREFIX} Resultados parciales - Vector: ${vectorResults.length}, BM25: ${bm25Results.length}`
      );

      // Paso 3: Fusionar resultados con RRF
      const fusedResults = HybridSearchService.reciprocalRankFusion(
        vectorResults,
        bm25Results,
        DEFAULT_RRF_K,
        vectorWeight,
        bm25Weight
      );

      // Paso 4: Tomar los topK mejores
      const finalResults = fusedResults.slice(0, topK);

      logger.info(
        `${SERVICE_PREFIX} Busqueda hibrida completada: ${finalResults.length} resultados (vectorW: ${vectorWeight}, bm25W: ${bm25Weight}, empresa: ${companyId})`
      );

      return finalResults;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en busqueda hibrida: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion - Fusiona resultados de multiples rankings
   *
   * Formula: RRF_score(d) = SUM( weight_i / (k + rank_i(d)) )
   *
   * Donde:
   * - k es una constante (default 60) que suaviza el impacto del ranking
   * - rank_i(d) es la posicion del documento d en el ranking i (1-indexed)
   * - weight_i es el peso del sistema de ranking i
   *
   * @param vectorResults - Resultados de la busqueda vectorial
   * @param bm25Results - Resultados de la busqueda BM25
   * @param k - Constante RRF (default 60)
   * @param vectorWeight - Peso de los resultados vectoriales
   * @param bm25Weight - Peso de los resultados BM25
   * @returns Array fusionado y deduplicado, ordenado por score combinado
   */
  private static reciprocalRankFusion(
    vectorResults: VectorSearchResult[],
    bm25Results: BM25SearchResult[],
    k: number = DEFAULT_RRF_K,
    vectorWeight: number = DEFAULT_VECTOR_WEIGHT,
    bm25Weight: number = DEFAULT_BM25_WEIGHT
  ): HybridSearchResult[] {
    // Mapa para acumular scores por chunkId
    const scoreMap = new Map<number, {
      chunkId: number;
      documentId: number;
      content: string;
      combinedScore: number;
      vectorScore: number;
      bm25Score: number;
      topic?: string;
      keywords?: string[];
    }>();

    // Procesar resultados vectoriales (rank 1-indexed)
    vectorResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = vectorWeight / (k + rank);

      const existing = scoreMap.get(result.chunkId);
      if (existing) {
        existing.combinedScore += rrfScore;
        existing.vectorScore = result.similarity;
      } else {
        scoreMap.set(result.chunkId, {
          chunkId: result.chunkId,
          documentId: result.documentId,
          content: result.content,
          combinedScore: rrfScore,
          vectorScore: result.similarity,
          bm25Score: 0,
          topic: result.topic,
          keywords: result.keywords
        });
      }
    });

    // Procesar resultados BM25 (rank 1-indexed)
    bm25Results.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = bm25Weight / (k + rank);

      const existing = scoreMap.get(result.chunkId);
      if (existing) {
        existing.combinedScore += rrfScore;
        existing.bm25Score = result.rank;
      } else {
        scoreMap.set(result.chunkId, {
          chunkId: result.chunkId,
          documentId: result.documentId,
          content: result.content,
          combinedScore: rrfScore,
          vectorScore: 0,
          bm25Score: result.rank,
          topic: undefined,
          keywords: undefined
        });
      }
    });

    // Convertir a array y ordenar por score combinado descendente
    const fusedResults: HybridSearchResult[] = Array.from(scoreMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .map(item => ({
        chunkId: item.chunkId,
        documentId: item.documentId,
        content: item.content,
        combinedScore: item.combinedScore,
        vectorScore: item.vectorScore > 0 ? item.vectorScore : undefined,
        bm25Score: item.bm25Score > 0 ? item.bm25Score : undefined,
        topic: item.topic,
        keywords: item.keywords
      }));

    return fusedResults;
  }
}

export default HybridSearchService;
