/**
 * EmbeddingService - Generacion de Embeddings con OpenAI
 *
 * Servicio encargado de generar embeddings vectoriales usando el modelo
 * text-embedding-3-small de OpenAI (1536 dimensiones).
 *
 * Funcionalidades:
 * - Generacion de embedding individual
 * - Generacion de embeddings en batch (max 2048 textos)
 * - Calculo de similitud coseno entre vectores
 * - Retry automatico con backoff exponencial (max 3 intentos)
 *
 * @module RAGServices/EmbeddingService
 */

import OpenAI from "openai";
import logger from "../../utils/logger";
import { trackEmbeddings } from "../TokenTrackingService/TokenTrackingService";
import { getDefaultProviderForCapability } from "../AIProviderService";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[EmbeddingService]";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 2048;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

// ============================================================================
// CLIENTE OPENAI SINGLETON
// ============================================================================

let openaiClient: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI> {
  if (!openaiClient) {
    // Usar AIProviderService para obtener la API key de la BD (configuración global SuperAdmin)
    const provider = await getDefaultProviderForCapability('text');
    if (!provider) {
      throw new Error(`${SERVICE_PREFIX} No hay proveedor de IA configurado`);
    }

    const apiKey = provider.apiKey;
    if (!apiKey) {
      throw new Error(`${SERVICE_PREFIX} API key no configurada en proveedor de IA`);
    }

    openaiClient = new OpenAI({
      apiKey,
      baseURL: provider.baseUrl || undefined,
      timeout: 60000,
      maxRetries: 0 // Manejamos reintentos manualmente
    });

    logger.info(`${SERVICE_PREFIX} Cliente OpenAI inicializado con API de BD`);
  }

  return openaiClient;
}

// ============================================================================
// UTILIDADES INTERNAS
// ============================================================================

/**
 * Espera un tiempo con backoff exponencial
 */
function backoffDelay(attempt: number): Promise<void> {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * delay * 0.1; // 10% jitter
  return new Promise(resolve => setTimeout(resolve, delay + jitter));
}

/**
 * Normaliza y limpia texto antes de generar embedding
 */
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")    // Multiples espacios a uno
    .replace(/\n+/g, " ")    // Saltos de linea a espacio
    .trim();
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class EmbeddingService {
  /**
   * Genera embedding para un texto usando text-embedding-3-small
   *
   * @param text - Texto a convertir en embedding
   * @param companyId - ID de la empresa (para tracking de tokens)
   * @returns Array de numeros representando el vector de 1536 dimensiones
   */
  static async generateEmbedding(text: string, companyId: number): Promise<number[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error(`${SERVICE_PREFIX} Texto vacio para generar embedding`);
      }

      const normalizedText = normalizeText(text);
      const client = await getOpenAIClient();

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: normalizedText,
            dimensions: EMBEDDING_DIMENSIONS
          });

          const embedding = response.data[0]?.embedding;
          if (!embedding || embedding.length === 0) {
            throw new Error(`${SERVICE_PREFIX} Respuesta de embedding vacia`);
          }

          // Track tokens de embedding
          if (response.usage) {
            await trackEmbeddings(companyId, EMBEDDING_MODEL, {
              prompt_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens
            });
          }

          logger.info(
            `${SERVICE_PREFIX} Embedding generado: ${embedding.length} dims, ${response.usage?.total_tokens || 0} tokens (empresa: ${companyId})`
          );

          return embedding;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Si es rate limit (429) o error de servidor (5xx), reintentar
          const statusCode = (err as { status?: number }).status;
          if (statusCode === 429 || (statusCode && statusCode >= 500)) {
            logger.warn(
              `${SERVICE_PREFIX} Intento ${attempt + 1}/${MAX_RETRIES} fallo (status: ${statusCode}), reintentando...`
            );
            await backoffDelay(attempt);
            continue;
          }

          // Cualquier otro error, no reintentar
          throw lastError;
        }
      }

      throw lastError || new Error(`${SERVICE_PREFIX} Todos los reintentos agotados`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error generando embedding: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Genera embeddings en batch (maximo 2048 textos por llamada)
   *
   * @param texts - Array de textos a convertir en embeddings
   * @param companyId - ID de la empresa (para tracking de tokens)
   * @returns Array de arrays de numeros (un vector por texto)
   */
  static async generateBatchEmbeddings(texts: string[], companyId: number): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) {
        throw new Error(`${SERVICE_PREFIX} Array de textos vacio para batch embeddings`);
      }

      if (texts.length > MAX_BATCH_SIZE) {
        throw new Error(
          `${SERVICE_PREFIX} Excede limite de batch: ${texts.length} textos (max: ${MAX_BATCH_SIZE})`
        );
      }

      const normalizedTexts = texts.map(t => normalizeText(t));
      const client = await getOpenAIClient();

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: normalizedTexts,
            dimensions: EMBEDDING_DIMENSIONS
          });

          // Ordenar por index (OpenAI puede devolver en desorden)
          const sorted = response.data.sort((a, b) => a.index - b.index);
          const embeddings = sorted.map(d => d.embedding);

          if (embeddings.length !== texts.length) {
            throw new Error(
              `${SERVICE_PREFIX} Discrepancia: se esperaban ${texts.length} embeddings, se recibieron ${embeddings.length}`
            );
          }

          // Track tokens
          if (response.usage) {
            await trackEmbeddings(companyId, EMBEDDING_MODEL, {
              prompt_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens
            });
          }

          logger.info(
            `${SERVICE_PREFIX} Batch embeddings generados: ${embeddings.length} textos, ${response.usage?.total_tokens || 0} tokens (empresa: ${companyId})`
          );

          return embeddings;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));

          const statusCode = (err as { status?: number }).status;
          if (statusCode === 429 || (statusCode && statusCode >= 500)) {
            logger.warn(
              `${SERVICE_PREFIX} Batch intento ${attempt + 1}/${MAX_RETRIES} fallo (status: ${statusCode}), reintentando...`
            );
            await backoffDelay(attempt);
            continue;
          }

          throw lastError;
        }
      }

      throw lastError || new Error(`${SERVICE_PREFIX} Todos los reintentos agotados en batch`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en batch embeddings: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Calcula similitud coseno entre dos vectores
   *
   * @param a - Primer vector
   * @param b - Segundo vector
   * @returns Valor entre -1 y 1 (1 = identicos, 0 = ortogonales, -1 = opuestos)
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `${SERVICE_PREFIX} Vectores de diferente longitud: ${a.length} vs ${b.length}`
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}

export default EmbeddingService;
