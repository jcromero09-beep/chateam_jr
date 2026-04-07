import HybridSearchService from "../RAGServices/HybridSearchService";
import SemanticCacheService from "../RAGServices/SemanticCacheService";
import EmbeddingService from "../RAGServices/EmbeddingService";
import { selectModel } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import PreprocessingService from "./PreprocessingService";
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
    chatbotId?: number;
    ticketContext?: string; // Contexto unificado (empresa, kanban, quickreplies, contacto)
    channel?: string;
    ticketHistory?: Array<{ role: string; content: string }>; // Historial de conversación
  } = {}
): Promise<RAGResponse> => {
  const startTime = Date.now();
  const { ticketId, contactId, maxResults = 5, minRelevance = 0.3, ticketContext, channel, ticketHistory = [] } = options;

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
    logger.error(`[RAGAgent] ❌ Error en búsqueda híbrida: ${searchError.message}`);
    searchResults = [];
  }

  // 📊 Log detallado de resultados de búsqueda
  if (searchResults && searchResults.length > 0) {
    logger.info(`[RAGAgent] 🔍 Búsqueda completada: ${searchResults.length} chunks encontrados para query="${query.substring(0, 50)}..."`);

    // Log de los primeros 3 chunks
    searchResults.slice(0, 3).forEach((result: any, index: number) => {
      const contentPreview = result.content?.substring(0, 80) || '';
      const similarity = result.similarity?.toFixed(3) || 'N/A';
      logger.debug(`[RAGAgent] 📄 Chunk ${index + 1} (score=${similarity}): "${contentPreview}..."`);
    });
  } else {
    logger.warn(`[RAGAgent] ⚠️ No se encontraron chunks en la búsqueda para query="${query.substring(0, 50)}..."`);
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
  // LIMITADO: máximo 3 chunks para evitar información excesiva
  // HybridSearchService devuelve 'combinedScore' (RRF ~0.009) y 'vectorScore' (coseno 0-1)
  // Filtrar por vectorScore (similitud real) si disponible, o combinedScore > 0 como fallback
  const contextChunks = searchResults
    .filter((r: any) => {
      const vectorSim = r.vectorScore || r.similarity || 0;
      const combined = r.combinedScore || r.score || 0;
      return vectorSim >= minRelevance || combined > 0;
    })
    .slice(0, 3); // Máximo 3 fuentes

  logger.info(`[RAGAgent] Chunks filtrados: ${contextChunks.length}/${searchResults.length} (minRelevance=${minRelevance}, scores: ${searchResults.slice(0, 3).map((r: any) => (r.combinedScore || r.score || r.similarity || 0).toFixed(3)).join(', ')})`);

  const context = contextChunks
    .map((chunk: any) => chunk.content)
    .join('\n\n');

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
    const { chatCompletion } = require("../AIClientService");

    // Construir mensajes en formato chat multi-turn
    const systemPrompt = buildRAGSystemPrompt(context, ticketContext, dbSystemPrompt);
    const ragMaxTokens = PreprocessingService.getMaxTokensForChannel(channel as any);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    // Agregar historial de conversación para que el LLM entienda el contexto
    if (ticketHistory.length > 0) {
      for (const msg of ticketHistory.slice(-10)) { // últimos 10 mensajes
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        if (msg.content && msg.content.trim()) {
          messages.push({ role, content: msg.content });
        }
      }
    }

    // Agregar el mensaje actual del usuario
    messages.push({ role: 'user', content: query });

    const llmResponse = await chatCompletion({
      messages,
      model: modelKey,
      maxTokens: ragMaxTokens,
      temperature: 0.5,
      companyId,
      module: 'chat' as any
    });

    answer = llmResponse.content;
    tokensUsed = {
      input: llmResponse.usage?.prompt_tokens || llmResponse.usage?.input_tokens || Math.ceil(query.length / 4),
      output: llmResponse.usage?.completion_tokens || llmResponse.usage?.output_tokens || Math.ceil(answer.length / 4)
    };
  } catch (llmError: any) {
    logger.error(`[RAGAgent] Error en generación LLM: ${llmError.message}`);

    // Fallback: respuesta genérica (NUNCA enviar chunks crudos al cliente)
    answer = "Tengo información sobre ese tema pero no pude procesarla correctamente. ¿Podrías reformular tu pregunta?";
  }

  // 6. Construir respuesta
  // HybridSearch devuelve: combinedScore (RRF, ~0.009), vectorScore (coseno, 0-1)
  // Para relevancia usamos vectorScore (similitud real), para filtrado combinedScore
  const getRelevance = (chunk: any) => chunk.vectorScore || chunk.similarity || chunk.combinedScore || chunk.score || 0;

  const sources = contextChunks.map((chunk: any) => ({
    documentId: chunk.documentId || 0,
    title: chunk.documentTitle || 'Documento',
    relevance: getRelevance(chunk),
    snippet: chunk.content.substring(0, 200)
  }));

  // Confianza basada en vectorScore (similitud coseno real, 0-1)
  // Si hay chunks relevantes con buena similitud, la confianza es alta
  const confidence = contextChunks.length > 0
    ? getRelevance(contextChunks[0])
    : 0.1;

  logger.info(`[RAGAgent] Confianza calculada: ${confidence.toFixed(3)}, chunks usados: ${contextChunks.length}, vectorScores: [${contextChunks.map((c: any) => getRelevance(c).toFixed(3)).join(', ')}]`);

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
 * Construye el SYSTEM PROMPT para el LLM con contexto RAG
 * El historial y la query del usuario se pasan como mensajes separados en formato chat
 */
function buildRAGSystemPrompt(context: string, ticketContext?: string, dbSystemPrompt?: string): string {
  const ticketSection = ticketContext ? `\n${ticketContext}\n` : '';
  const customPrompt = dbSystemPrompt ? `\n## INSTRUCCIONES PERSONALIZADAS\n${dbSystemPrompt}\n` : '';

  return `Eres un agente de atención al cliente profesional y empático.
NO eres un buscador de información. Tu trabajo es ATENDER al cliente como lo haría un humano.
${customPrompt}
## REGLAS DE LENGUAJE NATURAL (OBLIGATORIAS)
1. **Usa el nombre del cliente** si lo tienes en el contexto — nunca digas "Estimado usuario"
2. **Valida antes de preguntar** — no pidas datos que ya están en el historial o contexto
3. **Una pregunta a la vez** — nunca hagas múltiples preguntas en un solo mensaje
4. **Verbos activos** — di "Voy a revisar eso" en vez de "Se procederá a verificar su solicitud"
5. **Máximo 3-4 oraciones** — los mensajes largos no se leen en WhatsApp
6. **Cierra con acción** — termina con algo concreto, no con "Quedo a sus órdenes"
7. **Refleja el tono del usuario** — si es informal, sé informal. Si es formal, sé formal

## REGLAS DE CONTENIDO
- Da SOLO la información NECESARIA para resolver la consulta actual
- NO repitas información que ya dijiste en mensajes anteriores
- Si el cliente pregunta precio, da el precio directamente
- Si necesitas más información, PREGUNTA al cliente (solo una cosa a la vez)
- NO menciones fuentes, documentos ni bases de conocimiento al cliente
- Si la información NO está en el contexto, dilo honestamente y ofrece alternativa
- NUNCA inventes datos: precios, disponibilidad, fechas o políticas
- Si ya enviaste una imagen/ficha de producto, NO repitas esa información — refiérete a ella

## CONTEXTO ACTUAL
${ticketSection}
## BASE DE CONOCIMIENTOS (usa solo la información relevante):
${context}`;
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
