import { QueryTypes } from "sequelize";
import sequelize from "../../database";
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
  isFallback?: boolean;
  shouldEscalate?: boolean;
  escalationReason?: string;
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
    ticketContext?: string;
    channel?: string;
    ticketHistory?: Array<{ role: string; content: string }>;
    // Datos de QueryEnrichmentAgent
    enrichedQuery?: string;
    hydeQuery?: string;
    alternativeQueries?: string[];
    keywords?: string[];
  } = {}
): Promise<RAGResponse> => {
  const startTime = Date.now();
  const {
    ticketId, contactId, maxResults = 5, minRelevance = 0.3, ticketContext, channel,
    ticketHistory = [], enrichedQuery, hydeQuery, alternativeQueries = [], keywords = []
  } = options;

  // 🆕 Bug RAG-1 fix: cache key debe usar el enrichedQuery (contextualmente
  // estable), no el mensaje literal. Antes "si", "ok", "cuánto" colisionaban
  // en cache entre conversaciones distintas produciendo respuestas erróneas.
  const effectiveQuery = enrichedQuery || query;
  const cacheKey = `rag:${companyId}:${effectiveQuery}`;
  const cached = await SemanticCacheService.lookup(cacheKey, companyId);

  if (cached) {
    const cachedResponse = JSON.parse(cached.response) as RAGResponse;
    cachedResponse.cacheHit = true;
    cachedResponse.latencyMs = Date.now() - startTime;

    logger.info(`[RAGAgent] Cache hit para query: "${effectiveQuery.substring(0, 50)}..."`);

    // Log incluso para cache hits
    await logExecution(companyId, ticketId, contactId, cachedResponse, query);
    return cachedResponse;
  }

  // 2. Búsqueda híbrida MULTI-QUERY con datos de QueryEnrichmentAgent
  const primaryQuery = enrichedQuery || query;

  // Construir array de queries para búsqueda paralela
  const queriesToSearch: Array<{ query: string; weight: number; label: string }> = [
    { query: primaryQuery, weight: 0.4, label: "enriched" }
  ];

  if (hydeQuery && hydeQuery.length > 10) {
    queriesToSearch.push({ query: hydeQuery, weight: 0.3, label: "hyde" });
  }

  if (alternativeQueries.length > 0) {
    // Usar la mejor alternativa
    queriesToSearch.push({ query: alternativeQueries[0], weight: 0.2, label: "alt" });
  }

  // Keywords para BM25 adicional
  if (keywords.length > 0) {
    queriesToSearch.push({ query: keywords.join(" "), weight: 0.1, label: "keywords" });
  }

  // Si no hay enriquecimiento, usar query original con fallback de historial
  if (queriesToSearch.length === 1 && query.trim().split(/\s+/).length <= 4 && ticketHistory.length > 0) {
    const lastMessages = ticketHistory.slice(-4)
      .map(m => m.content)
      .filter(c => c && c.length > 3)
      .join(" ");
    queriesToSearch[0].query = `${lastMessages} ${query}`.trim();
  }

  logger.info(`[RAGAgent] Búsqueda multi-query: ${queriesToSearch.map(q => `${q.label}(w=${q.weight})`).join(", ")}`);

  let searchResults: any[] = [];
  try {
    // Ejecutar todas las búsquedas en paralelo
    const searchPromises = queriesToSearch.map(q =>
      HybridSearchService.search(q.query, companyId, {
        topK: maxResults,
        vectorWeight: 0.6,
        bm25Weight: 0.4
      }).then(results => results.map(r => ({ ...r, _searchWeight: q.weight, _searchLabel: q.label })))
        .catch(() => [])
    );

    const allResults = await Promise.all(searchPromises);

    // Fusionar y deduplicar por chunkId con scoring ponderado
    const scoreMap = new Map<number, any>();
    for (const results of allResults) {
      for (const r of results) {
        const existing = scoreMap.get(r.chunkId);
        const weightedScore = (r.vectorScore || r.combinedScore || 0) * r._searchWeight;
        if (existing) {
          existing.fusedScore += weightedScore;
          existing.matchCount += 1;
        } else {
          scoreMap.set(r.chunkId, {
            ...r,
            fusedScore: weightedScore,
            matchCount: 1
          });
        }
      }
    }

    // Ordenar por score fusionado y tomar los mejores
    searchResults = Array.from(scoreMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, maxResults);

    // Bonus: chunks que matchearon en múltiples queries son más relevantes
    searchResults.forEach(r => {
      if (r.matchCount >= 2) r.fusedScore *= 1.3;
      if (r.matchCount >= 3) r.fusedScore *= 1.2;
    });

    logger.info(`[RAGAgent] Multi-query completada: ${scoreMap.size} chunks únicos → top ${searchResults.length}`);
  } catch (searchError: any) {
    logger.error(`[RAGAgent] ❌ Error en búsqueda multi-query: ${searchError.message}`);
    searchResults = [];
  }

  // 📊 Log detallado de resultados de búsqueda
  // 🆕 Bug RAG-2 fix: loguear el query EFECTIVO (enriquecido) que se usó en
  // el embedding, no el mensaje literal del cliente. Antes decía query="si..."
  // aunque internamente buscara con el enrichedQuery.
  if (searchResults && searchResults.length > 0) {
    logger.info(`[RAGAgent] 🔍 Búsqueda completada: ${searchResults.length} chunks encontrados para query="${effectiveQuery.substring(0, 50)}..."`);

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

  // 4a. Cargar SIEMPRE los chunks de tipo "manual" (reglas, horarios, protocolo)
  // Estos son instrucciones de la empresa que el agente SIEMPRE debe conocer
  let mandatoryChunks: any[] = [];
  try {
    const mandatoryResults = await sequelize.query(`
      SELECT c.id AS "chunkId", c."documentId", c.content, c.topic, c.keywords,
        d.title AS "documentTitle", d."sourceType"
      FROM "AIChunks" c
      JOIN "AIDocuments" d ON d.id = c."documentId"
      WHERE c."companyId" = :companyId
        AND d."sourceType" = 'manual'
        AND d.status = 'completed'
      ORDER BY c.id ASC
    `, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });
    mandatoryChunks = mandatoryResults as any[];
    if (mandatoryChunks.length > 0) {
      logger.info(`[RAGAgent] Chunks obligatorios (manual): ${mandatoryChunks.length} cargados`);
    }
  } catch (mandatoryErr: any) {
    logger.warn(`[RAGAgent] Error cargando chunks obligatorios: ${mandatoryErr.message}`);
  }

  // 4b. RONDA 1: Filtrar chunks de búsqueda relevantes
  let contextChunks = searchResults
    .filter((r: any) => {
      const fused = r.fusedScore || 0;
      const vectorSim = r.vectorScore || r.similarity || 0;
      const combined = r.combinedScore || r.score || 0;
      return fused > 0 || vectorSim >= minRelevance || combined > 0;
    })
    .slice(0, 5);

  const getChunkScore = (c: any) => c.fusedScore || c.vectorScore || c.similarity || c.combinedScore || 0;
  let bestScore = contextChunks.length > 0 ? getChunkScore(contextChunks[0]) : 0;

  logger.info(`[RAGAgent] RONDA 1: ${contextChunks.length} chunks, bestScore=${bestScore.toFixed(3)}`);

  // 4b-R2. RONDA 2: Si score bajo, buscar con queries alternativos restantes + keywords
  if (bestScore < 0.40 && alternativeQueries.length > 1) {
    logger.info(`[RAGAgent] RONDA 2: Score bajo (${bestScore.toFixed(3)}), buscando con queries alternativos...`);

    try {
      const extraSearches = alternativeQueries.slice(1).map(altQ =>
        HybridSearchService.search(altQ, companyId, {
          topK: maxResults,
          vectorWeight: 0.6,
          bm25Weight: 0.4
        }).catch(() => [])
      );

      // También buscar solo por keywords con BM25
      if (keywords.length > 0) {
        extraSearches.push(
          HybridSearchService.search(keywords.join(" "), companyId, {
            topK: maxResults,
            vectorWeight: 0.2,
            bm25Weight: 0.8 // Más peso a BM25 para keywords
          }).catch(() => [])
        );
      }

      const extraResults = await Promise.all(extraSearches);

      // Fusionar con resultados existentes (deduplicar por chunkId)
      const existingIds = new Set(contextChunks.map((c: any) => c.chunkId));
      for (const results of extraResults) {
        for (const r of results) {
          if (!existingIds.has(r.chunkId)) {
            existingIds.add(r.chunkId);
            contextChunks.push(r);
          }
        }
      }

      // Re-ordenar por score y tomar top 5
      contextChunks.sort((a: any, b: any) => getChunkScore(b) - getChunkScore(a));
      contextChunks = contextChunks.slice(0, 5);
      bestScore = contextChunks.length > 0 ? getChunkScore(contextChunks[0]) : 0;

      logger.info(`[RAGAgent] RONDA 2 completada: ${contextChunks.length} chunks, bestScore=${bestScore.toFixed(3)}`);
    } catch (r2Error: any) {
      logger.warn(`[RAGAgent] Error en RONDA 2: ${r2Error.message}`);
    }
  }

  logger.info(`[RAGAgent] Chunks finales: ${contextChunks.length}/${searchResults.length}`);

  // 4c. Combinar: reglas obligatorias PRIMERO + chunks de búsqueda DESPUÉS
  const searchChunkIds = new Set(contextChunks.map((c: any) => c.chunkId));
  const uniqueMandatory = mandatoryChunks.filter((m: any) => !searchChunkIds.has(m.chunkId));

  const allContextParts: string[] = [];

  if (uniqueMandatory.length > 0) {
    allContextParts.push(
      `--- REGLAS Y POLÍTICAS DE LA EMPRESA (CUMPLIMIENTO OBLIGATORIO) ---\n` +
      uniqueMandatory.map((c: any) => c.content).join('\n\n')
    );
  }

  if (contextChunks.length > 0) {
    allContextParts.push(
      `--- INFORMACIÓN DE PRODUCTOS Y SERVICIOS ---\n` +
      contextChunks.map((chunk: any) => chunk.content).join('\n\n')
    );
  }

  // 4d. RONDA 3: Si score SIGUE bajo, inyectar modo honesto
  if (bestScore < 0.25) {
    allContextParts.push(
      `\n--- ⚠️ ALERTA DE BAJA RELEVANCIA ---\n` +
      `No se encontró información relevante en la base de conocimientos para esta consulta.\n` +
      `NO inventes datos. Responde que no tienes esa información específica y ofrece conectar con un asesor humano.`
    );
    logger.warn(`[RAGAgent] RONDA 3: Modo honesto activado (bestScore=${bestScore.toFixed(3)})`);
  }

  const context = allContextParts.join('\n\n');

  // 5. Seleccionar modelo y generar respuesta
  const modelSelection = await selectModel('rag', query);
  const modelKey = modelSelection?.entity.key || 'gpt-4.1-mini';

  let answer: string;
  let tokensUsed = { input: 0, output: 0 };
  let isFallback = false;

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

  // Helper local: retry con backoff exponencial para fallas de red con OpenAI
  const chatCompletionWithRetry = async (params: any, maxAttempts = 3): Promise<any> => {
    const { chatCompletion } = require("../AIClientService");
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await chatCompletion(params);
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || "");
        const transient =
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("fetch failed") ||
          msg.includes("Connection error") ||
          msg.includes("socket hang up") ||
          msg.includes("network") ||
          (err?.status && [408, 429, 500, 502, 503, 504].includes(err.status));
        if (!transient || attempt === maxAttempts) throw err;
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
        logger.warn(`[RAGAgent] chatCompletion falló (${msg.substring(0, 80)}), reintento ${attempt}/${maxAttempts - 1} en ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  };

  try {
    const ragMaxTokens = PreprocessingService.getMaxTokensForChannel(channel as any);

    // ═══════════════════════════════════════════════════════════════════
    // PASADA 1: ANÁLISIS Y DECISIÓN (JSON)
    // El LLM razona sobre el contexto y decide qué hacer
    // ═══════════════════════════════════════════════════════════════════
    const analysisPrompt = `Eres un analizador experto de conversaciones de atención al cliente.
Tu trabajo es analizar el mensaje del cliente con todo el contexto disponible y DECIDIR qué hacer.

## CONTEXTO DISPONIBLE
${ticketContext || '(sin contexto adicional)'}

## REGLAS Y CONOCIMIENTO DE LA EMPRESA
${context}

## HISTORIAL DE LA CONVERSACIÓN
${ticketHistory.length > 0
  ? ticketHistory.slice(-10).map(m => `${m.role === 'assistant' ? 'AGENTE' : 'CLIENTE'}: ${m.content}`).join('\n')
  : '(primer mensaje, sin historial)'}

## MENSAJE ACTUAL DEL CLIENTE
"${query}"

## TU TAREA
Analiza y responde SOLO con un JSON válido (sin markdown, sin backticks):

{
  "contexto_detectado": "descripción breve del contexto (ej: 'primer mensaje, petición vaga sobre GPS')",
  "es_primer_mensaje": true|false,
  "cliente_especifico_que_necesita": true|false,
  "info_faltante": ["qué falta saber, ej: tipo de vehículo, presupuesto"],
  "reglas_aplicables": ["qué reglas del CONOCIMIENTO aplican aquí"],
  "opciones_consideradas": [
    {"opcion": "descripción", "viable": true|false, "razon": "por qué"}
  ],
  "decision": "preguntar_clarificacion | dar_informacion | ofrecer_producto | derivar_humano | saludar",
  "que_hacer": "instrucción específica para el redactor (ej: 'preguntar tipo de vehículo antes de recomendar')",
  "datos_a_usar": "qué datos específicos del CONOCIMIENTO usar en la respuesta (copia textual si aplica)",
  "prohibiciones": ["qué NO hacer en la respuesta"]
}`;

    logger.info(`[RAGAgent] PASADA 1: Análisis y decisión...`);
    const analysisResponse = await chatCompletionWithRetry({
      messages: [
        { role: 'system', content: 'Responde SOLO con JSON válido. Sin markdown, sin backticks, sin explicación fuera del JSON.' },
        { role: 'user', content: analysisPrompt }
      ],
      model: modelKey,
      maxTokens: 800,
      temperature: 0.1,
      companyId,
      module: 'classification' as any
    });

    let analysis: any = {};
    try {
      const text = analysisResponse.content?.trim() || '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch (parseErr) {
      logger.warn(`[RAGAgent] Error parseando análisis JSON, usando fallback`);
      analysis = { decision: 'dar_informacion', que_hacer: 'responder con la información disponible' };
    }

    logger.info(
      `[RAGAgent] Decisión: ${analysis.decision} | ${analysis.que_hacer?.substring(0, 80) || ''}`
    );

    // ═══════════════════════════════════════════════════════════════════
    // PASADA 2: REDACCIÓN FINAL
    // El LLM redacta el mensaje natural según la decisión tomada
    // ═══════════════════════════════════════════════════════════════════
    const systemPrompt = buildRAGSystemPrompt(context, ticketContext, dbSystemPrompt);

    const instruccionRedactor = `
## DECISIÓN TOMADA POR EL ANALIZADOR
Acción: ${analysis.decision || 'dar_informacion'}
Instrucción: ${analysis.que_hacer || 'responder con información disponible'}
Datos a usar: ${analysis.datos_a_usar || 'los del CONTEXTO arriba'}
Prohibiciones: ${Array.isArray(analysis.prohibiciones) ? analysis.prohibiciones.join(', ') : 'ninguna'}

Redacta la respuesta final al cliente siguiendo EXACTAMENTE esta decisión.
NO muestres el razonamiento, solo la respuesta final en lenguaje natural para WhatsApp.`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt + '\n' + instruccionRedactor }
    ];

    // Agregar historial
    if (ticketHistory.length > 0) {
      for (const msg of ticketHistory.slice(-10)) {
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        if (msg.content && msg.content.trim()) {
          messages.push({ role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: query });

    logger.info(`[RAGAgent] PASADA 2: Redacción final...`);
    const llmResponse = await chatCompletionWithRetry({
      messages,
      model: modelKey,
      maxTokens: ragMaxTokens,
      temperature: 0.3, // Baja para seguir la decisión sin inventar
      companyId,
      module: 'chat' as any
    });

    answer = llmResponse.content;

    // Sumar tokens de ambas pasadas
    const analysisTokens = (analysisResponse.usage?.prompt_tokens || 0) + (analysisResponse.usage?.completion_tokens || 0);
    const redactionTokens = (llmResponse.usage?.prompt_tokens || 0) + (llmResponse.usage?.completion_tokens || 0);
    tokensUsed = {
      input: (analysisResponse.usage?.prompt_tokens || 0) + (llmResponse.usage?.prompt_tokens || 0),
      output: (analysisResponse.usage?.completion_tokens || 0) + (llmResponse.usage?.completion_tokens || 0)
    };

    logger.info(
      `[RAGAgent] Completado 2 pasadas: tokens=${analysisTokens + redactionTokens}, decisión=${analysis.decision}`
    );
  } catch (llmError: any) {
    logger.error(`[RAGAgent] Error en generación LLM (2 pasadas): ${llmError.message}`);
    answer = "Déjame conectarte con un asesor humano para que te ayude mejor con tu consulta. 🙏";
    isFallback = true;
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

  // Confianza: usar fusedScore (multi-query) normalizado, o vectorScore como fallback
  // fusedScore con multi-query puede ser > 1 por acumulación de pesos, normalizamos a 0-1
  const getConfidence = (chunk: any) => {
    if (chunk.fusedScore) return Math.min(chunk.fusedScore * 2, 0.95); // fusedScore ~0.1-0.5 → 0.2-0.95
    return getRelevance(chunk);
  };

  const confidence = contextChunks.length > 0
    ? getConfidence(contextChunks[0])
    : 0.1;

  logger.info(`[RAGAgent] Confianza calculada: ${confidence.toFixed(3)}, chunks usados: ${contextChunks.length}, fusedScores: [${contextChunks.map((c: any) => (c.fusedScore || getRelevance(c)).toFixed(3)).join(', ')}]`);

  // Detectar heurísticamente si la respuesta indica handoff a humano
  const handoffRegex = /te conecto con (un )?asesor|conectarte con (un )?asesor|equipo de ventas|nuestro equipo te|deriva(r|re) (al|a un) asesor|asesor humano/i;
  const hasHandoffText = handoffRegex.test(answer || "");

  const response: RAGResponse = {
    answer,
    sources,
    confidence: isFallback ? Math.min(confidence, 0.3) : confidence,
    modelUsed: modelKey,
    latencyMs: Date.now() - startTime,
    tokensUsed,
    cacheHit: false,
    searchResults: searchResults.length,
    isFallback,
    shouldEscalate: isFallback || hasHandoffText,
    escalationReason: isFallback
      ? "llm_failure"
      : hasHandoffText
        ? "handoff_text_detected"
        : undefined
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

## ⚠️ REGLA CRÍTICA — PROHIBIDO INVENTAR
- Responde ÚNICAMENTE con datos que aparecen en la BASE DE CONOCIMIENTOS de abajo
- Si un precio, horario, fecha, plan o característica NO aparece abajo, NO LO DIGAS
- NO digas "te envío la ficha" ni "te envío información" — solo responde con texto
- Si no tienes la información que el cliente pide, responde: "Esa información la maneja directamente nuestro equipo. ¿Te gustaría que te conecte con un asesor?"
- Es MEJOR derivar a un humano que inventar un dato incorrecto

## REGLAS DE CONTENIDO
- Da SOLO la información que aparece en la BASE DE CONOCIMIENTOS de abajo
- NO repitas información que ya dijiste en mensajes anteriores
- Si necesitas más información del cliente, PREGUNTA (solo una cosa a la vez)
- NO menciones fuentes, documentos ni bases de conocimiento al cliente
- Si ya se envió una imagen/ficha de producto, NO repitas esa información

## CONTEXTO ACTUAL
${ticketSection}
## BASE DE CONOCIMIENTOS (responde SOLO con esta información, NO inventes nada fuera de aquí):
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
