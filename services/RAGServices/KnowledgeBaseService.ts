/**
 * KnowledgeBaseService - CRUD y Procesamiento de Knowledge Base
 *
 * Servicio principal de la Knowledge Base que orquesta todas las operaciones
 * de creacion, procesamiento, busqueda y gestion de documentos de conocimiento.
 *
 * Flujo de procesamiento:
 * 1. Crear documento (status: pending)
 * 2. Procesar documento:
 *    a. Extraer contenido textual
 *    b. Dividir en chunks (ChunkingService)
 *    c. Generar embeddings por chunk (EmbeddingService)
 *    d. Almacenar chunks con embeddings (SQL raw para pgvector)
 * 3. Actualizar estadisticas del documento (status: completed)
 *
 * Busqueda:
 * - Interfaz principal para agentes IA que usa HybridSearchService
 * - Soporta filtro por documentIds especificos
 *
 * @module RAGServices/KnowledgeBaseService
 */

import { QueryTypes, Op } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";
import AIDocument from "../../models/AIDocument";
import EmbeddingService from "./EmbeddingService";
import ChunkingService, { Chunk } from "./ChunkingService";
import HybridSearchService, { HybridSearchResult } from "./HybridSearchService";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[KnowledgeBaseService]";
const EMBEDDING_BATCH_SIZE = 50; // Procesar embeddings en lotes de 50
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// ============================================================================
// INTERFACES
// ============================================================================

interface CreateDocumentData {
  title: string;
  sourceType: string;
  content?: string;
  filePath?: string;
  sourceUrl?: string;
}

interface ListDocumentsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

interface SearchOptions {
  topK?: number;
  documentIds?: number[];
  language?: string;
}

interface KBStats {
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
  byStatus: Record<string, number>;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class KnowledgeBaseService {
  /**
   * Crear un nuevo documento en la Knowledge Base
   *
   * El documento se crea con status 'pending'. Debe procesarse
   * posteriormente con processDocument() para generar chunks y embeddings.
   *
   * @param companyId - ID de la empresa
   * @param data - Datos del documento (titulo, tipo, contenido/ruta/url)
   * @returns Documento creado
   */
  static async createDocument(
    companyId: number,
    data: CreateDocumentData
  ): Promise<AIDocument> {
    try {
      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      if (!data.title || data.title.trim().length === 0) {
        throw new Error(`${SERVICE_PREFIX} El titulo del documento es obligatorio`);
      }

      if (!data.sourceType) {
        throw new Error(`${SERVICE_PREFIX} El tipo de fuente es obligatorio`);
      }

      const document = await AIDocument.create({
        companyId,
        title: data.title.trim(),
        sourceType: data.sourceType,
        sourceUrl: data.sourceUrl || null,
        filePath: data.filePath || null,
        status: "pending",
        chunksCount: 0,
        tokensCount: 0,
        fileSizeBytes: data.content ? Buffer.byteLength(data.content, "utf8") : 0,
        metadata: {
          ...(data.content ? { hasInlineContent: true } : {}),
          createdVia: "api"
        }
      } as Partial<AIDocument>);

      // Si se proporciona contenido inline, almacenarlo temporalmente en metadata
      if (data.content) {
        await document.update({
          metadata: {
            ...document.metadata,
            rawContent: data.content
          }
        });
      }

      logger.info(
        `${SERVICE_PREFIX} Documento creado: ID=${document.id}, titulo="${data.title}", tipo="${data.sourceType}" (empresa: ${companyId})`
      );

      return document;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error creando documento: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Procesar documento: extraer contenido, chunk, embed y almacenar
   *
   * Flujo:
   * 1. Marca el documento como 'processing'
   * 2. Extrae el contenido textual (desde metadata.rawContent o archivo)
   * 3. Divide el contenido en chunks (chunking semantico)
   * 4. Genera embeddings en batch para todos los chunks
   * 5. Almacena chunks con embeddings usando SQL raw (pgvector)
   * 6. Actualiza estadisticas y marca como 'completed'
   *
   * En caso de error, marca el documento como 'error' con el mensaje.
   *
   * @param documentId - ID del documento a procesar
   */
  static async processDocument(documentId: number): Promise<void> {
    let document: AIDocument | null = null;

    try {
      // Obtener documento
      document = await AIDocument.findByPk(documentId);
      if (!document) {
        throw new Error(`${SERVICE_PREFIX} Documento no encontrado: ID=${documentId}`);
      }

      // Marcar como processing
      await document.update({ status: "processing", errorMessage: null } as Partial<AIDocument>);

      logger.info(`${SERVICE_PREFIX} Iniciando procesamiento del documento ID=${documentId}`);

      // Paso 1: Extraer contenido textual
      const content = await KnowledgeBaseService.extractContent(document);
      if (!content || content.trim().length === 0) {
        throw new Error(`${SERVICE_PREFIX} No se pudo extraer contenido del documento ID=${documentId}`);
      }

      logger.info(
        `${SERVICE_PREFIX} Contenido extraido: ${content.length} caracteres (doc: ${documentId})`
      );

      // Paso 2: Dividir en chunks (chunking semantico)
      const chunks = ChunkingService.semanticChunking(content, 500);
      if (chunks.length === 0) {
        throw new Error(`${SERVICE_PREFIX} No se generaron chunks para el documento ID=${documentId}`);
      }

      logger.info(
        `${SERVICE_PREFIX} Chunks generados: ${chunks.length} (doc: ${documentId})`
      );

      // Paso 3: Generar embeddings en batch
      const chunkTexts = chunks.map(c => c.content);
      const allEmbeddings: number[][] = [];

      // Procesar en lotes para evitar timeouts y limites de API
      for (let i = 0; i < chunkTexts.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunkTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchEmbeddings = await EmbeddingService.generateBatchEmbeddings(
          batch,
          document.companyId
        );
        allEmbeddings.push(...batchEmbeddings);

        logger.info(
          `${SERVICE_PREFIX} Embeddings generados: lote ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(chunkTexts.length / EMBEDDING_BATCH_SIZE)} (doc: ${documentId})`
        );
      }

      // Paso 4: Almacenar chunks con embeddings en la BD
      await KnowledgeBaseService.storeChunks(
        document.id,
        document.companyId,
        chunks,
        allEmbeddings
      );

      // Paso 5: Calcular totales y actualizar documento
      const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

      // Limpiar rawContent de metadata (ya procesado)
      const cleanMetadata = { ...document.metadata };
      delete (cleanMetadata as Record<string, unknown>).rawContent;

      await document.update({
        status: "completed",
        chunksCount: chunks.length,
        tokensCount: totalTokens,
        processedAt: new Date(),
        errorMessage: null,
        metadata: cleanMetadata
      } as Partial<AIDocument>);

      logger.info(
        `${SERVICE_PREFIX} Documento procesado exitosamente: ID=${documentId}, ${chunks.length} chunks, ${totalTokens} tokens (empresa: ${document.companyId})`
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error procesando documento ID=${documentId}: ${errorMsg}`);

      // Marcar documento como error
      if (document) {
        await document.update({
          status: "error",
          errorMessage: errorMsg
        } as Partial<AIDocument>).catch(updateErr => {
          logger.error(`${SERVICE_PREFIX} Error actualizando status de error: ${updateErr}`);
        });
      }

      throw error;
    }
  }

  /**
   * Listar documentos de una empresa con paginacion
   *
   * @param companyId - ID de la empresa
   * @param options - Opciones de filtrado y paginacion
   * @returns Documentos y total
   */
  static async listDocuments(
    companyId: number,
    options?: ListDocumentsOptions
  ): Promise<{ documents: AIDocument[]; total: number }> {
    try {
      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      const page = options?.page ?? DEFAULT_PAGE;
      const limit = options?.limit ?? DEFAULT_LIMIT;
      const offset = (page - 1) * limit;

      const where: Record<string, unknown> = { companyId };
      if (options?.status) {
        where.status = options.status;
      }

      const { rows: documents, count: total } = await AIDocument.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit,
        offset
      });

      logger.info(
        `${SERVICE_PREFIX} Listado: ${documents.length} de ${total} documentos (pagina: ${page}, empresa: ${companyId})`
      );

      return { documents, total };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error listando documentos: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Eliminar documento y todos sus chunks asociados
   *
   * @param documentId - ID del documento a eliminar
   * @param companyId - ID de la empresa (verificacion de pertenencia)
   */
  static async deleteDocument(documentId: number, companyId: number): Promise<void> {
    try {
      const document = await AIDocument.findOne({
        where: { id: documentId, companyId }
      });

      if (!document) {
        throw new Error(
          `${SERVICE_PREFIX} Documento no encontrado: ID=${documentId} (empresa: ${companyId})`
        );
      }

      // Eliminar chunks asociados primero (CASCADE deberia manejarlo, pero hacemos explicit)
      await sequelize.query(
        `DELETE FROM "AIChunks" WHERE "documentId" = :documentId AND "companyId" = :companyId`,
        {
          replacements: { documentId, companyId },
          type: QueryTypes.DELETE
        }
      );

      // Eliminar documento
      await document.destroy();

      logger.info(
        `${SERVICE_PREFIX} Documento eliminado: ID=${documentId} (empresa: ${companyId})`
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error eliminando documento: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Reindexar documento: eliminar chunks actuales y reprocesar
   *
   * @param documentId - ID del documento a reindexar
   */
  static async reindexDocument(documentId: number): Promise<void> {
    try {
      const document = await AIDocument.findByPk(documentId);
      if (!document) {
        throw new Error(`${SERVICE_PREFIX} Documento no encontrado: ID=${documentId}`);
      }

      logger.info(`${SERVICE_PREFIX} Iniciando reindexacion del documento ID=${documentId}`);

      // Eliminar chunks existentes
      const [, deleteMetadata] = await sequelize.query(
        `DELETE FROM "AIChunks" WHERE "documentId" = :documentId RETURNING id`,
        {
          replacements: { documentId },
          type: QueryTypes.SELECT
        }
      );

      logger.info(
        `${SERVICE_PREFIX} Chunks anteriores eliminados para documento ID=${documentId}`
      );

      // Resetear contadores
      await document.update({
        status: "pending",
        chunksCount: 0,
        tokensCount: 0,
        processedAt: null,
        errorMessage: null
      } as Partial<AIDocument>);

      // Reprocesar
      await KnowledgeBaseService.processDocument(documentId);

      logger.info(`${SERVICE_PREFIX} Reindexacion completada para documento ID=${documentId}`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error reindexando documento: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Buscar en Knowledge Base (interfaz principal para agentes IA)
   *
   * Usa HybridSearchService para combinar busqueda vectorial y BM25
   * con Reciprocal Rank Fusion.
   *
   * @param query - Texto de busqueda en lenguaje natural
   * @param companyId - ID de la empresa
   * @param options - Opciones de busqueda (topK, documentIds)
   * @returns Resultados de busqueda hibrida
   */
  static async search(
    query: string,
    companyId: number,
    options?: SearchOptions
  ): Promise<HybridSearchResult[]> {
    try {
      if (!query || query.trim().length === 0) {
        logger.warn(`${SERVICE_PREFIX} Query de busqueda vacia`);
        return [];
      }

      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio para buscar`);
      }

      const results = await HybridSearchService.search(query, companyId, {
        topK: options?.topK ?? 5,
        documentIds: options?.documentIds,
        language: options?.language
      });

      logger.info(
        `${SERVICE_PREFIX} Busqueda KB: ${results.length} resultados para "${query.substring(0, 50)}..." (empresa: ${companyId})`
      );

      return results;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en busqueda KB: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Estadisticas de la Knowledge Base por empresa
   *
   * @param companyId - ID de la empresa
   * @returns Estadisticas agregadas
   */
  static async getStats(companyId: number): Promise<KBStats> {
    try {
      if (!companyId) {
        throw new Error(`${SERVICE_PREFIX} companyId es obligatorio`);
      }

      // Query para totales y agrupacion por status
      const statsQuery = `
        SELECT
          COUNT(*) AS "totalDocuments",
          COALESCE(SUM("chunksCount"), 0) AS "totalChunks",
          COALESCE(SUM("tokensCount"), 0) AS "totalTokens"
        FROM "AIDocuments"
        WHERE "companyId" = :companyId
      `;

      const statusQuery = `
        SELECT
          status,
          COUNT(*) AS count
        FROM "AIDocuments"
        WHERE "companyId" = :companyId
        GROUP BY status
      `;

      const [statsResults, statusResults] = await Promise.all([
        sequelize.query<{
          totalDocuments: string;
          totalChunks: string;
          totalTokens: string;
        }>(statsQuery, {
          replacements: { companyId },
          type: QueryTypes.SELECT
        }),
        sequelize.query<{
          status: string;
          count: string;
        }>(statusQuery, {
          replacements: { companyId },
          type: QueryTypes.SELECT
        })
      ]);

      const stats = statsResults[0];
      const byStatus: Record<string, number> = {};

      for (const row of statusResults) {
        byStatus[row.status] = parseInt(row.count, 10);
      }

      const result: KBStats = {
        totalDocuments: parseInt(stats?.totalDocuments || "0", 10),
        totalChunks: parseInt(stats?.totalChunks || "0", 10),
        totalTokens: parseInt(stats?.totalTokens || "0", 10),
        byStatus
      };

      logger.info(
        `${SERVICE_PREFIX} Stats KB: ${result.totalDocuments} docs, ${result.totalChunks} chunks, ${result.totalTokens} tokens (empresa: ${companyId})`
      );

      return result;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error obteniendo estadisticas KB: ${errorMsg}`);
      throw error;
    }
  }

  // ==========================================================================
  // METODOS PRIVADOS
  // ==========================================================================

  /**
   * Extrae contenido textual del documento
   * Busca primero en metadata.rawContent (contenido inline),
   * luego podria leer de filePath si es un archivo.
   */
  private static async extractContent(document: AIDocument): Promise<string> {
    // Contenido inline (almacenado en metadata durante creacion)
    const rawContent = (document.metadata as Record<string, unknown>)?.rawContent;
    if (typeof rawContent === "string" && rawContent.length > 0) {
      return rawContent;
    }

    // Si hay filePath, intentar leer el archivo
    if (document.filePath) {
      try {
        const fs = await import("fs/promises");
        const content = await fs.readFile(document.filePath, "utf-8");
        return content;
      } catch (readErr: unknown) {
        const errorMsg = readErr instanceof Error ? readErr.message : String(readErr);
        throw new Error(
          `${SERVICE_PREFIX} Error leyendo archivo ${document.filePath}: ${errorMsg}`
        );
      }
    }

    throw new Error(
      `${SERVICE_PREFIX} No se encontro contenido para el documento ID=${document.id}: no hay rawContent ni filePath`
    );
  }

  /**
   * Almacena chunks con embeddings usando SQL raw (necesario para pgvector)
   *
   * @param documentId - ID del documento padre
   * @param companyId - ID de la empresa
   * @param chunks - Array de chunks generados
   * @param embeddings - Array de embeddings correspondientes (mismo orden)
   */
  private static async storeChunks(
    documentId: number,
    companyId: number,
    chunks: Chunk[],
    embeddings: number[][]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `${SERVICE_PREFIX} Discrepancia chunks/embeddings: ${chunks.length} vs ${embeddings.length}`
      );
    }

    // Insertar chunks uno a uno con SQL raw para manejar pgvector
    // Usamos transaccion para atomicidad
    const transaction = await sequelize.transaction();

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const embeddingStr = `[${embedding.join(",")}]`;

        await sequelize.query(
          `
          INSERT INTO "AIChunks" (
            "documentId",
            "companyId",
            content,
            "chunkIndex",
            "tokenCount",
            topic,
            keywords,
            embedding,
            metadata,
            "createdAt"
          ) VALUES (
            :documentId,
            :companyId,
            :content,
            :chunkIndex,
            :tokenCount,
            :topic,
            :keywords::text[],
            :embedding::vector,
            :metadata::jsonb,
            NOW()
          )
          `,
          {
            replacements: {
              documentId,
              companyId,
              content: chunk.content,
              chunkIndex: chunk.index,
              tokenCount: chunk.tokenCount,
              topic: chunk.topic || null,
              keywords: chunk.keywords && chunk.keywords.length > 0 
                ? '{' + chunk.keywords.map((k: string) => '"' + k.replace(/"/g, '\"') + '"').join(',') + '}' 
                : null,
              embedding: embeddingStr,
              metadata: JSON.stringify(chunk.metadata || {})
            },
            type: QueryTypes.INSERT,
            transaction
          }
        );
      }

      await transaction.commit();

      logger.info(
        `${SERVICE_PREFIX} ${chunks.length} chunks almacenados con embeddings (doc: ${documentId}, empresa: ${companyId})`
      );
    } catch (error: unknown) {
      await transaction.rollback();
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`${SERVICE_PREFIX} Error almacenando chunks: ${errorMsg}`);
    }
  }
}

export default KnowledgeBaseService;
