/**
 * ImprovedContextRetrieval
 *
 * Mejora la búsqueda de chunks relevantes resolviendo 3 problemas:
 * 1. Selección incorrecta de chunks (búsqueda híbrida mejorada)
 * 2. Pérdida de contexto en conversaciones largas (ventana deslizante inteligente)
 * 3. Repeticiones (tracking de respuestas previas)
 */

import OpenAI from "openai";
import fsc from "fs/promises";
import Message from "../../models/Message.js";

// 📊 Importar servicio de tracking de tokens
import { trackEmbeddings } from "../TokenTrackingService/TokenTrackingService.js";

// ===================== Tipos =====================

type ChunkData = {
  chunk: string;
  embedding?: number[];
  embedding_unit?: number[];
  topic?: string;
  keywords?: string[];
};

type SearchResult = {
  chunk: string;
  score: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
  topic?: string;
};

type ConversationContext = {
  recentMessages: string[];      // Últimos 5 mensajes
  userQuestions: string[];        // Preguntas del usuario
  botResponses: string[];         // Respuestas del bot
  mainQuery: string;              // Consulta principal sintetizada
};

// ===================== Helpers =====================

function toF32Normalized(vec: number[]): Float32Array {
  const f = new Float32Array(vec.length);
  let norm2 = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    f[i] = v;
    norm2 += v * v;
  }
  const norm = Math.sqrt(norm2) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOPWORDS = new Set([
  "el","la","los","las","de","del","y","o","en","con","para","por",
  "un","una","que","se","su","es","son","me","tu","le","nos","si","como"
]);

function extractKeywords(text: string, max = 8): string[] {
  const normalized = normalizeText(text);
  const tokens = normalized.split(/\s+/).filter(t =>
    t.length > 2 && !STOPWORDS.has(t)
  );

  const freq = new Map<string, number>();
  tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

// ===================== Análisis de Conversación =====================

export class ConversationAnalyzer {

  /**
   * Extrae el contexto estructurado de los mensajes
   */
  static analyzeConversation(messages: Message[]): ConversationContext {
    const context: ConversationContext = {
      recentMessages: [],
      userQuestions: [],
      botResponses: [],
      mainQuery: ""
    };

    // Tomar últimos 10 mensajes
    const recent = messages.slice(-10);

    for (const msg of recent) {
      const body = msg.body || "";

      if (msg.fromMe) {
        // Respuesta del bot
        context.botResponses.push(body);
      } else {
        // Mensaje del usuario
        context.recentMessages.push(body);

        // Detectar si es pregunta
        if (body.includes("?") ||
            /^(qué|cuál|cómo|dónde|cuándo|quién|por qué)/i.test(body)) {
          context.userQuestions.push(body);
        }
      }
    }

    // Sintetizar consulta principal
    context.mainQuery = this.synthesizeMainQuery(context);

    return context;
  }

  /**
   * Sintetiza una consulta principal desde el contexto
   * Prioriza: última pregunta > últimos 3 mensajes usuario > último mensaje
   */
  private static synthesizeMainQuery(context: ConversationContext): string {
    // 1. Si hay preguntas recientes, usar la última
    if (context.userQuestions.length > 0) {
      return context.userQuestions[context.userQuestions.length - 1];
    }

    // 2. Si no, combinar últimos 3 mensajes del usuario
    const recentUser = context.recentMessages.slice(-3);
    if (recentUser.length > 0) {
      return recentUser.join(" ");
    }

    // 3. Fallback: último mensaje
    return context.recentMessages[context.recentMessages.length - 1] || "";
  }

  /**
   * Genera un resumen de lo que el bot ya respondió (para evitar repeticiones)
   */
  static getPreviousResponsesSummary(messages: Message[]): string {
    const botMessages = messages
      .filter(m => m.fromMe)
      .slice(-5) // Últimas 5 respuestas
      .map(m => m.body);

    if (botMessages.length === 0) return "";

    return "**YA RESPONDISTE ANTERIORMENTE:**\n" +
           botMessages.map(m => `- ${m.substring(0, 100)}...`).join("\n") +
           "\n**NO REPITAS ESTA INFORMACIÓN**\n";
  }
}

// ===================== Búsqueda Mejorada =====================

export class ImprovedChunkSearch {

  /**
   * Busca chunks relevantes con algoritmo híbrido mejorado
   *
   * Mejoras:
   * 1. Usa la consulta SINTETIZADA en lugar de todo el historial
   * 2. Multi-paso: keyword → semantic → re-rank
   * 3. Diversidad: evita chunks redundantes
   */
  static async searchRelevantChunks(
    embeddingPath: string,
    conversationContext: ConversationContext,
    openai: OpenAI,
    options?: {
      maxChunks?: number;
      minSimilarity?: number;
      diversityThreshold?: number;
      companyId?: number;  // para tracking de tokens
    }
  ): Promise<SearchResult[]> {
    const {
      maxChunks = 3,
      minSimilarity = 0.55,
      diversityThreshold = 0.8, // chunks con >80% similitud se consideran redundantes
      companyId
    } = options || {};

    // 1. Cargar embeddings
    const rawData = await fsc.readFile(embeddingPath, "utf-8");
    const chunks: ChunkData[] = JSON.parse(rawData);

    if (chunks.length === 0) return [];

    // 2. Preparar embeddings normalizados
    const entries = chunks
      .map(c => {
        let vec: Float32Array | null = null;
        if (c.embedding_unit) {
          vec = toF32Normalized(c.embedding_unit);
        } else if (c.embedding) {
          vec = toF32Normalized(c.embedding);
        }
        return vec ? {
          chunk: c.chunk,
          vec,
          keywords: c.keywords || [],
          topic: c.topic
        } : null;
      })
      .filter(Boolean) as Array<{
        chunk: string;
        vec: Float32Array;
        keywords: string[];
        topic?: string;
      }>;

    // 3. Extraer keywords de la consulta principal
    const queryKeywords = extractKeywords(conversationContext.mainQuery);

    // 4. PASO 1: Filtrado por keywords (rápido)
    const keywordMatches = entries
      .map(entry => {
        const matchCount = entry.keywords.filter(k =>
          queryKeywords.includes(normalizeText(k))
        ).length;

        return {
          entry,
          keywordScore: matchCount,
          semanticScore: 0
        };
      })
      .filter(m => m.keywordScore > 0)
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, 10); // Top 10 por keywords

    // 5. PASO 2: Búsqueda semántica en el subset (o en todos si no hay matches)
    const candidateEntries = keywordMatches.length > 0
      ? keywordMatches.map(m => m.entry)
      : entries;

    // Generar embedding de la consulta
    const queryEmbedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: conversationContext.mainQuery || " "
    });

    // 📊 REGISTRAR TOKENS DE EMBEDDING
    if (companyId && queryEmbedding.usage) {
      await trackEmbeddings(companyId, "text-embedding-3-small", queryEmbedding.usage);
    }

    const queryVec = toF32Normalized(
      queryEmbedding.data[0].embedding as unknown as number[]
    );

    // Calcular similitud semántica
    const semanticScores = candidateEntries.map(entry => {
      const similarity = dotProduct(queryVec, entry.vec);
      return {
        chunk: entry.chunk,
        score: similarity,
        keywords: entry.keywords,
        topic: entry.topic
      };
    });

    // 6. PASO 3: Combinar scores (híbrido)
    const hybridResults = semanticScores.map(s => {
      const keywordMatch = keywordMatches.find(
        km => km.entry.chunk === s.chunk
      );

      const keywordScore = keywordMatch ? keywordMatch.keywordScore : 0;
      const normalizedKeyword = Math.min(keywordScore / 3, 1); // normalizar a 0-1

      // Peso: 30% keywords, 70% semántica
      const hybridScore = 0.3 * normalizedKeyword + 0.7 * ((s.score + 1) / 2);

      return {
        chunk: s.chunk,
        score: hybridScore,
        matchType: (keywordScore > 0 && s.score > 0.5)
          ? 'hybrid'
          : (keywordScore > 0 ? 'keyword' : 'semantic'),
        topic: s.topic
      } as SearchResult;
    });

    // 7. PASO 4: Filtrar por similitud mínima
    const filtered = hybridResults.filter(r => {
      // Si tiene keyword match, ser más permisivo
      if (r.matchType === 'keyword' || r.matchType === 'hybrid') {
        return r.score > 0.3;
      }
      return r.score > minSimilarity;
    });

    // 8. PASO 5: Ordenar y aplicar diversidad
    filtered.sort((a, b) => b.score - a.score);

    const diverse: SearchResult[] = [];
    for (const result of filtered) {
      if (diverse.length >= maxChunks) break;

      // Verificar si es suficientemente diferente de los ya seleccionados
      const isDiverse = diverse.every(selected => {
        const similarity = this.textSimilarity(result.chunk, selected.chunk);
        return similarity < diversityThreshold;
      });

      if (isDiverse) {
        diverse.push(result);
      }
    }

    return diverse;
  }

  /**
   * Calcula similitud entre dos textos (Jaccard)
   */
  private static textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(normalizeText(text1).split(/\s+/));
    const words2 = new Set(normalizeText(text2).split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Formatea los chunks encontrados para el contexto del prompt
   */
  static formatContextForPrompt(results: SearchResult[]): string {
    if (results.length === 0) return "";

    const lines = ["**INFORMACIÓN RELEVANTE DE LA BASE DE CONOCIMIENTO:**\n"];

    results.forEach((result, index) => {
      if (result.topic) {
        lines.push(`\n[Tema ${index + 1}: ${result.topic}]`);
      }
      lines.push(result.chunk);
      lines.push(""); // línea en blanco
    });

    return lines.join("\n");
  }
}
