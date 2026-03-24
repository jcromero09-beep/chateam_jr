/**
 * ChunkingService - Estrategias de Chunking para Documentos
 *
 * Servicio encargado de dividir documentos de texto en chunks manejables
 * para su posterior embedding y almacenamiento vectorial.
 *
 * Implementa multiples estrategias de chunking:
 * - Fijo por palabras: Divide por tamano fijo con overlap configurable
 * - Semantico: Divide por parrafos/secciones respetando limites naturales
 * - Parent-Child: Genera chunks jerarquicos (ideal para FAQs, manuales)
 *
 * Tambien incluye utilidades para extraccion de keywords y estimacion
 * de tokens.
 *
 * @module RAGServices/ChunkingService
 */

import logger from "../../utils/logger";

// ============================================================================
// CONSTANTES
// ============================================================================

const SERVICE_PREFIX = "[ChunkingService]";
const DEFAULT_WORDS_PER_CHUNK = 300;
const DEFAULT_OVERLAP_WORDS = 50;
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_MAX_KEYWORDS = 10;

// Factor de conversion palabras -> tokens para espanol
// En espanol, las palabras son mas largas que en ingles, por lo que
// la relacion tokens/palabra es mayor (~1.33 tokens por palabra)
const TOKENS_PER_WORD_ES = 1.33;
const TOKENS_PER_WORD_EN = 0.75;

// ============================================================================
// INTERFACES
// ============================================================================

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
  topic?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// UTILIDADES INTERNAS
// ============================================================================

/**
 * Divide texto en palabras respetando Unicode
 */
function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(w => w.length > 0);
}

/**
 * Detecta si un texto es predominantemente en espanol
 * (heuristica simple basada en caracteres y palabras comunes)
 */
function isSpanish(text: string): boolean {
  const spanishIndicators = /[áéíóúñ¿¡]/i;
  const commonSpanishWords = /\b(que|del|los|las|una|para|con|por|como|pero|más|este|esta|todo|puede|tiene|cuando|donde|desde|hasta|entre|sobre|otro|otros|cada|mismo|bien|algo|nada|mucho|poco|solo|aquí|ahí|después|antes|durante|también|además|sin|contra|según|hacia|mientras)\b/i;
  return spanishIndicators.test(text) || commonSpanishWords.test(text);
}

/**
 * Limpia texto removiendo exceso de whitespace
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Lista de stop words en espanol para extraccion de keywords
const STOP_WORDS_ES = new Set([
  "a", "al", "algo", "algunas", "algunos", "ante", "antes", "como",
  "con", "contra", "cual", "cuando", "de", "del", "desde", "donde",
  "durante", "e", "el", "ella", "ellas", "ellos", "en", "entre",
  "era", "esa", "esas", "ese", "eso", "esos", "esta", "estaba",
  "estado", "estar", "estas", "este", "esto", "estos", "fue",
  "fuera", "fueron", "ha", "hacia", "hay", "la", "las", "le",
  "les", "lo", "los", "mas", "más", "me", "mi", "mía", "mío",
  "muy", "nada", "ni", "no", "nos", "nosotros", "nuestro", "o",
  "otra", "otras", "otro", "otros", "para", "pero", "por", "que",
  "qué", "se", "ser", "si", "sí", "sin", "sino", "sobre", "son",
  "su", "sus", "también", "te", "ti", "tiene", "todo", "todos",
  "tu", "tú", "tus", "un", "una", "unas", "uno", "unos", "usted",
  "ustedes", "y", "ya", "yo"
]);

const STOP_WORDS_EN = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by",
  "can", "do", "for", "from", "had", "has", "have", "he", "her",
  "his", "how", "i", "if", "in", "into", "is", "it", "its", "may",
  "my", "no", "not", "of", "on", "or", "our", "out", "say", "she",
  "so", "some", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "to", "up", "us", "was", "we",
  "were", "what", "when", "which", "who", "will", "with", "would",
  "you", "your"
]);

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

class ChunkingService {
  /**
   * Chunking fijo por palabras con overlap
   *
   * Divide el texto en chunks de tamano fijo (por numero de palabras)
   * con una ventana de overlap para mantener contexto entre chunks.
   *
   * @param text - Texto a dividir en chunks
   * @param wordsPerChunk - Numero de palabras por chunk (default: 300)
   * @param overlap - Numero de palabras de overlap entre chunks (default: 50)
   * @returns Array de chunks con indice, contenido y conteo de tokens
   */
  static fixedChunking(
    text: string,
    wordsPerChunk: number = DEFAULT_WORDS_PER_CHUNK,
    overlap: number = DEFAULT_OVERLAP_WORDS
  ): Chunk[] {
    try {
      const cleaned = cleanText(text);
      if (!cleaned || cleaned.length === 0) {
        logger.warn(`${SERVICE_PREFIX} Texto vacio para chunking fijo`);
        return [];
      }

      const words = splitWords(cleaned);
      if (words.length === 0) {
        return [];
      }

      // Validar parametros
      if (overlap >= wordsPerChunk) {
        logger.warn(
          `${SERVICE_PREFIX} Overlap (${overlap}) >= wordsPerChunk (${wordsPerChunk}), ajustando overlap a ${Math.floor(wordsPerChunk / 4)}`
        );
        overlap = Math.floor(wordsPerChunk / 4);
      }

      const chunks: Chunk[] = [];
      const step = wordsPerChunk - overlap;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += step) {
        const chunkWords = words.slice(i, i + wordsPerChunk);
        const content = chunkWords.join(" ");

        if (content.trim().length === 0) {
          continue;
        }

        const keywords = ChunkingService.extractKeywords(content);

        chunks.push({
          content,
          index: chunkIndex,
          tokenCount: ChunkingService.estimateTokens(content),
          keywords: keywords.length > 0 ? keywords : undefined,
          metadata: {
            strategy: "fixed",
            wordsPerChunk,
            overlap,
            wordStart: i,
            wordEnd: Math.min(i + wordsPerChunk, words.length)
          }
        });

        chunkIndex++;

        // Si el siguiente paso no dejaria suficientes palabras para un chunk significativo
        if (i + step >= words.length) {
          break;
        }
      }

      logger.info(
        `${SERVICE_PREFIX} Chunking fijo: ${chunks.length} chunks de ~${wordsPerChunk} palabras (overlap: ${overlap})`
      );

      return chunks;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en chunking fijo: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Chunking semantico por parrafos y secciones
   *
   * Divide el texto respetando los limites naturales del texto (parrafos,
   * secciones con encabezados) y agrupa parrafos hasta alcanzar el limite
   * de tokens maximo.
   *
   * @param text - Texto a dividir en chunks
   * @param maxTokens - Maximo de tokens por chunk (default: 500)
   * @returns Array de chunks respetando limites semanticos
   */
  static semanticChunking(text: string, maxTokens: number = DEFAULT_MAX_TOKENS): Chunk[] {
    try {
      const cleaned = cleanText(text);
      if (!cleaned || cleaned.length === 0) {
        logger.warn(`${SERVICE_PREFIX} Texto vacio para chunking semantico`);
        return [];
      }

      // Dividir por secciones (doble salto de linea o encabezados con #/*)
      const sections = cleaned.split(/\n{2,}|\n(?=#{1,6}\s)|(?=\*{2,}[^*])/);

      const chunks: Chunk[] = [];
      let currentChunkParts: string[] = [];
      let currentTokens = 0;
      let chunkIndex = 0;

      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        const sectionTokens = ChunkingService.estimateTokens(trimmed);

        // Si la seccion sola excede el limite, dividirla por oraciones
        if (sectionTokens > maxTokens) {
          // Guardar chunk acumulado actual si existe
          if (currentChunkParts.length > 0) {
            const content = currentChunkParts.join("\n\n");
            const keywords = ChunkingService.extractKeywords(content);

            chunks.push({
              content,
              index: chunkIndex++,
              tokenCount: currentTokens,
              keywords: keywords.length > 0 ? keywords : undefined,
              metadata: { strategy: "semantic", type: "paragraph_group" }
            });
            currentChunkParts = [];
            currentTokens = 0;
          }

          // Dividir seccion grande por oraciones
          const sentences = trimmed.split(/(?<=[.!?])\s+/);
          let sentenceBuffer: string[] = [];
          let sentenceTokens = 0;

          for (const sentence of sentences) {
            const sTokens = ChunkingService.estimateTokens(sentence);

            if (sentenceTokens + sTokens > maxTokens && sentenceBuffer.length > 0) {
              const content = sentenceBuffer.join(" ");
              const keywords = ChunkingService.extractKeywords(content);

              chunks.push({
                content,
                index: chunkIndex++,
                tokenCount: sentenceTokens,
                keywords: keywords.length > 0 ? keywords : undefined,
                metadata: { strategy: "semantic", type: "sentence_split" }
              });
              sentenceBuffer = [];
              sentenceTokens = 0;
            }

            sentenceBuffer.push(sentence);
            sentenceTokens += sTokens;
          }

          // Guardar oraciones restantes
          if (sentenceBuffer.length > 0) {
            const content = sentenceBuffer.join(" ");
            const keywords = ChunkingService.extractKeywords(content);

            chunks.push({
              content,
              index: chunkIndex++,
              tokenCount: sentenceTokens,
              keywords: keywords.length > 0 ? keywords : undefined,
              metadata: { strategy: "semantic", type: "sentence_split" }
            });
          }

          continue;
        }

        // Si agregar esta seccion excede el limite, guardar chunk actual
        if (currentTokens + sectionTokens > maxTokens && currentChunkParts.length > 0) {
          const content = currentChunkParts.join("\n\n");
          const keywords = ChunkingService.extractKeywords(content);

          chunks.push({
            content,
            index: chunkIndex++,
            tokenCount: currentTokens,
            keywords: keywords.length > 0 ? keywords : undefined,
            metadata: { strategy: "semantic", type: "paragraph_group" }
          });
          currentChunkParts = [];
          currentTokens = 0;
        }

        currentChunkParts.push(trimmed);
        currentTokens += sectionTokens;
      }

      // Guardar chunk final si existe
      if (currentChunkParts.length > 0) {
        const content = currentChunkParts.join("\n\n");
        const keywords = ChunkingService.extractKeywords(content);

        chunks.push({
          content,
          index: chunkIndex++,
          tokenCount: currentTokens,
          keywords: keywords.length > 0 ? keywords : undefined,
          metadata: { strategy: "semantic", type: "paragraph_group" }
        });
      }

      logger.info(
        `${SERVICE_PREFIX} Chunking semantico: ${chunks.length} chunks (maxTokens: ${maxTokens})`
      );

      return chunks;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en chunking semantico: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Chunking parent-child para documentos estructurados
   *
   * Genera dos niveles de chunks: parents (secciones completas) y
   * children (sub-secciones o parrafos individuales). Los children
   * mantienen referencia a su parent para contexto jerarquico.
   *
   * Ideal para FAQs, manuales, documentacion tecnica.
   *
   * @param text - Texto a dividir en chunks jerarquicos
   * @returns Objeto con arrays de parents y children
   */
  static parentChildChunking(text: string): { parents: Chunk[]; children: Chunk[] } {
    try {
      const cleaned = cleanText(text);
      if (!cleaned || cleaned.length === 0) {
        logger.warn(`${SERVICE_PREFIX} Texto vacio para chunking parent-child`);
        return { parents: [], children: [] };
      }

      const parents: Chunk[] = [];
      const children: Chunk[] = [];

      // Detectar secciones por encabezados (# Titulo, ## Subtitulo, etc.)
      // o por separadores (---, ***, ===) o por doble linea en blanco
      const sectionPattern = /(?=^#{1,6}\s)|(?=^[-*=]{3,}\s*$)/m;
      const rawSections = cleaned.split(sectionPattern).filter(s => s.trim().length > 0);

      // Si no hay secciones claras, usar parrafos como estructura
      const sections = rawSections.length > 1
        ? rawSections
        : cleaned.split(/\n{3,}/).filter(s => s.trim().length > 0);

      let parentIndex = 0;
      let childIndex = 0;

      for (const section of sections) {
        const trimmedSection = section.trim();
        if (!trimmedSection) continue;

        // Extraer titulo de la seccion (primera linea si parece encabezado)
        const lines = trimmedSection.split("\n");
        const firstLine = lines[0].trim();
        const isHeader = /^#{1,6}\s/.test(firstLine) || firstLine.length < 100;
        const sectionTopic = isHeader
          ? firstLine.replace(/^#{1,6}\s*/, "").trim()
          : undefined;

        // Parent: seccion completa
        const parentKeywords = ChunkingService.extractKeywords(trimmedSection);

        parents.push({
          content: trimmedSection,
          index: parentIndex,
          tokenCount: ChunkingService.estimateTokens(trimmedSection),
          topic: sectionTopic,
          keywords: parentKeywords.length > 0 ? parentKeywords : undefined,
          metadata: {
            strategy: "parent_child",
            role: "parent",
            childStartIndex: childIndex
          }
        });

        // Children: dividir la seccion en parrafos/sub-secciones
        const paragraphs = trimmedSection
          .split(/\n{2,}/)
          .filter(p => p.trim().length > 0);

        const childrenOfParent: number[] = [];

        for (const paragraph of paragraphs) {
          const trimmedParagraph = paragraph.trim();
          if (trimmedParagraph.length < 20) continue; // Ignorar parrafos muy cortos

          const childKeywords = ChunkingService.extractKeywords(trimmedParagraph);

          children.push({
            content: trimmedParagraph,
            index: childIndex,
            tokenCount: ChunkingService.estimateTokens(trimmedParagraph),
            topic: sectionTopic,
            keywords: childKeywords.length > 0 ? childKeywords : undefined,
            metadata: {
              strategy: "parent_child",
              role: "child",
              parentIndex
            }
          });

          childrenOfParent.push(childIndex);
          childIndex++;
        }

        // Actualizar parent con indices de sus children
        if (parents[parentIndex]) {
          (parents[parentIndex].metadata as Record<string, unknown>).childIndices = childrenOfParent;
          (parents[parentIndex].metadata as Record<string, unknown>).childCount = childrenOfParent.length;
        }

        parentIndex++;
      }

      logger.info(
        `${SERVICE_PREFIX} Chunking parent-child: ${parents.length} parents, ${children.length} children`
      );

      return { parents, children };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`${SERVICE_PREFIX} Error en chunking parent-child: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Extrae keywords relevantes de un texto
   *
   * Utiliza un enfoque basado en frecuencia de palabras (TF) con filtrado
   * de stop words en espanol e ingles. Retorna las palabras mas frecuentes.
   *
   * @param text - Texto del que extraer keywords
   * @param maxKeywords - Numero maximo de keywords a retornar (default: 10)
   * @returns Array de keywords ordenadas por frecuencia
   */
  static extractKeywords(text: string, maxKeywords: number = DEFAULT_MAX_KEYWORDS): string[] {
    try {
      if (!text || text.trim().length === 0) {
        return [];
      }

      const words = text
        .toLowerCase()
        .replace(/[^\w\sáéíóúñü]/g, " ") // Solo letras, numeros y acentos
        .split(/\s+/)
        .filter(w => w.length >= 3); // Minimo 3 caracteres

      if (words.length === 0) {
        return [];
      }

      // Contar frecuencias excluyendo stop words
      const stopWords = isSpanish(text) ? STOP_WORDS_ES : STOP_WORDS_EN;
      const frequency = new Map<string, number>();

      for (const word of words) {
        if (stopWords.has(word)) continue;
        if (/^\d+$/.test(word)) continue; // Ignorar numeros puros

        frequency.set(word, (frequency.get(word) || 0) + 1);
      }

      // Ordenar por frecuencia descendente y tomar las top N
      const sorted = Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([word]) => word);

      return sorted;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`${SERVICE_PREFIX} Error extrayendo keywords: ${errorMsg}`);
      return [];
    }
  }

  /**
   * Estima la cantidad de tokens de un texto
   *
   * Utiliza la heuristica de ~1.33 tokens por palabra en espanol
   * y ~0.75 tokens por palabra en ingles (aproximacion para
   * tokenizadores BPE como los de OpenAI).
   *
   * @param text - Texto a estimar
   * @returns Numero estimado de tokens
   */
  static estimateTokens(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0;
    }

    const words = splitWords(text);
    const tokensPerWord = isSpanish(text) ? TOKENS_PER_WORD_ES : TOKENS_PER_WORD_EN;

    return Math.ceil(words.length * tokensPerWord);
  }
}

export default ChunkingService;
