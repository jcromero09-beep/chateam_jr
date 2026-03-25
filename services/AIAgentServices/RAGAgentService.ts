import HybridSearchService from "../RAGServices/HybridSearchService";
import SemanticCacheService from "../RAGServices/SemanticCacheService";
import EmbeddingService from "../RAGServices/EmbeddingService";
import { selectModel } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import logger from "../../utils/logger";

/**
 * RAG Agent — Búsqueda y respuesta basada en Knowledge Base
 *
 * Pipeline:
 * 1. Verificar cache semántico
 * 2. Búsqueda híbrida (Vector + BM25 + Reranking)
 * 3. Construir contexto con chunks relevantes
 * 4. Generar respuesta con LLM + contexto
 * 5. Evaluar calidad y cachear si es buena
 *
 * Particularidades:
 * - Usa HybridSearch que combina pgvector + ts_rank con RRF
 * - Incluye citas de las fuentes usadas
 * - Si no encuentra info relevante, lo indica claramente
 */

export interface RAGResponse {
  answer: string;
  sources: Array<{
    documentId: number;
    title: string;
    relevance: number;
    snippet: string;
  }>;
  confidence: number;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  cacheHit: boolean;
  searchResults: number;
}

/**
 * Procesa una consulta RAG completa
 */
const processQuery = async (
  query: string,
  companyId: number,
  options: {
    ticketId?: number;
    contactId?: number;
    maxResults?: number;
    minRelevance?: number;
    chatbotId?: number; // Si viene de un chatbot específico
    ticketContext?: string; // Contexto de tags del ticket (kanban + notas)
  } = {}
): Promise<RAGResponse> => {
  const startTime = Date.now();
  const { ticketId, contactId, maxResults = 5, minRelevance = 0.3, ticketContext } = options;

  // 1. Verificar cache semántico
  const cacheKey = `rag:${companyId}:${query}`;
  const cached = await SemanticCacheService.lookup(cacheKey, companyId);

  if (cached) {
    const cachedResponse = JSON.parse(cached.response) as RAGResponse;
    cachedResponse.cacheHit = true;
    cachedResponse.latencyMs = Date.now() - startTime;

    logger.info(`[RAGAgent] Cache hit para query: "${query.substring(0, 50)}..."`);

    // Log incluso para cache hits
    await logExecution(companyId, ticketId, contactId, cachedResponse, query);
    return cachedResponse;
  }

  // 2. Búsqueda híbrida en Knowledge Base
  let searchResults;
  try {
    searchResults = await HybridSearchService.search(query, companyId, {
      topK: maxResults,
      vectorWeight: 0.6,
      bm25Weight: 0.4
    });
  } catch (searchError: any) {
    logger.error(`[RAGAgent] Error en búsqueda híbrida: ${searchError.message}`);
    searchResults = [];
  }

  // 3. Si no hay resultados, responder honestamente
  if (!searchResults || searchResults.length === 0) {
    const noResultResponse: RAGResponse = {
      answer: "No encontré información relevante en la base de conocimientos para tu consulta. " +
              "¿Podrías reformular tu pregunta o quieres que te transfiera a un agente humano?",
      sources: [],
      confidence: 0.1,
      modelUsed: 'none',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 },
      cacheHit: false,
      searchResults: 0
    };

    await logExecution(companyId, ticketId, contactId, noResultResponse, query);
    return noResultResponse;
  }

  // 4. Construir contexto con los chunks encontrados
  const contextChunks = searchResults
    .filter((r: any) => r.score >= minRelevance)
    .slice(0, maxResults);

  const context = contextChunks
    .map((chunk: any, i: number) =>
      `[Fuente ${i + 1}] (relevancia: ${(chunk.score * 100).toFixed(0)}%)\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  // 5. Seleccionar modelo y generar respuesta
  const modelSelection = await selectModel('rag', query);
  const modelKey = modelSelection?.entity.key || 'gpt-4.1-mini';

  let answer: string;
  let tokensUsed = { input: 0, output: 0 };

  // Cargar systemPrompt personalizado de BD (si existe)
  let dbSystemPrompt: string | undefined;
  try {
    const AIAgentConfig = require("../../models/AIAgentConfig").default;
    const agentConfig = await AIAgentConfig.findOne({ where: { slug: 'faq-inteligente' } });
    if (agentConfig?.systemPrompt) {
      dbSystemPrompt = agentConfig.systemPrompt;
    }
  } catch (configErr: any) {
    logger.warn(`[RAGAgent] No se pudo cargar config de BD: ${configErr.message}`);
  }

  try {
    const AIClientService = require("../AIClientService").default;
    const prompt = buildRAGPrompt(query, context, ticketContext);

    const llmResponse = await AIClientService.generateText({
      prompt,
      systemPrompt: dbSystemPrompt,
      modelKey,
      maxTokens: 1024,
      temperature: 0.3 // Baja temperatura para factualidad
    });

    answer = llmResponse.text;
    tokensUsed = {
      input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
      output: llmResponse.usage?.completionTokens || Math.ceil(answer.length / 4)
    };
  } catch (llmError: any) {
    logger.error(`[RAGAgent] Error en generación LLM: ${llmError.message}`);

    // Fallback: devolver los chunks directamente
    answer = "Encontré la siguiente información relevante:\n\n" +
      contextChunks.map((chunk: any, i: number) =>
        `${i + 1}. ${chunk.content.substring(0, 300)}...`
      ).join('\n\n');
  }

  // 6. Construir respuesta
  const sources = contextChunks.map((chunk: any) => ({
    documentId: chunk.documentId || 0,
    title: chunk.documentTitle || 'Documento',
    relevance: chunk.score,
    snippet: chunk.content.substring(0, 200)
  }));

  const confidence = contextChunks.length > 0
    ? contextChunks[0].score
    : 0.1;

  const response: RAGResponse = {
    answer,
    sources,
    confidence,
    modelUsed: modelKey,
    latencyMs: Date.now() - startTime,
    tokensUsed,
    cacheHit: false,
    searchResults: searchResults.length
  };

  // 7. Cachear si la confianza es suficiente (> 0.7)
  if (confidence > 0.7) {
    try {
      const queryEmbedding = await EmbeddingService.generateEmbedding(query, companyId);
      await SemanticCacheService.store(
        cacheKey,
        queryEmbedding,
        JSON.stringify(response),
        companyId,
        {
          modelUsed: modelKey,
          agentUsed: 'rag',
          tokensInput: tokensUsed.input,
          tokensOutput: tokensUsed.output,
          costUsd: calculateCost(tokensUsed, modelKey)
        }
      );
    } catch (cacheError: any) {
      logger.warn(`[RAGAgent] Error al cachear: ${cacheError.message}`);
    }
  }

  // 8. Log de ejecución
  await logExecution(companyId, ticketId, contactId, response, query);

  logger.info(
    `[RAGAgent] Respuesta: ${searchResults.length} resultados, ` +
    `confidence=${confidence.toFixed(2)}, model=${modelKey}, ` +
    `latency=${response.latencyMs}ms`
  );

  return response;
};

/**
 * Construye el prompt para el LLM con contexto RAG
 */
function buildRAGPrompt(query: string, context: string, ticketContext?: string): string {
  const ticketSection = ticketContext ? `\n${ticketContext}\n` : '';

  return `${ticketSection}Eres un asistente experto que responde preguntas usando la información proporcionada.

CONTEXTO DE LA BASE DE CONOCIMIENTOS:
${context}

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con información del contexto proporcionado
2. Si la información no está en el contexto, di "No tengo información sobre eso"
3. Cita las fuentes usando [Fuente N] cuando uses información específica
4. Responde en el mismo idioma que la pregunta del usuario
5. Sé conciso pero completo
6. No inventes información

PREGUNTA DEL USUARIO:
${query}

RESPUESTA:`;
}

/**
 * Registra log de ejecución del agente RAG
 */
async function logExecution(
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  response: RAGResponse,
  query: string
): Promise<void> {
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'rag',
      modelUsed: response.modelUsed,
      inputTokens: response.tokensUsed.input,
      outputTokens: response.tokensUsed.output,
      costUsd: calculateCost(response.tokensUsed, response.modelUsed),
      latencyMs: response.latencyMs,
      confidence: response.confidence,
      cacheHit: response.cacheHit,
      inputSummary: query.substring(0, 200),
      outputSummary: response.answer.substring(0, 200),
      metadata: {
        searchResults: response.searchResults,
        sourcesCount: response.sources.length
      }
    });
  } catch (error: any) {
    logger.warn(`[RAGAgent] Error al registrar log: ${error.message}`);
  }
}

/**
 * Calcula costo aproximado basado en tokens y modelo
 */
function calculateCost(
  tokens: { input: number; output: number },
  modelKey: string
): number {
  // Costos aproximados por 1K tokens (USD)
  const costs: Record<string, { input: number; output: number }> = {
    'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
    'gpt-4.1': { input: 0.002, output: 0.008 },
    'claude-3.5-haiku': { input: 0.0008, output: 0.004 },
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 }
  };

  const modelCost = costs[modelKey] || { input: 0.001, output: 0.003 };
  return (tokens.input / 1000) * modelCost.input +
         (tokens.output / 1000) * modelCost.output;
}

export default {
  processQuery
};
