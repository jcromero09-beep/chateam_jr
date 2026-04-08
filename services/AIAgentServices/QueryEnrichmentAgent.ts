/**
 * QueryEnrichmentAgent — Clasificación + Enriquecimiento de Queries en una sola llamada LLM
 *
 * REEMPLAZA a RouterAgentService para clasificación por LLM.
 * Conserva quickClassify() para patrones rápidos (greeting, farewell, escalation, appointment).
 *
 * En una sola llamada LLM:
 * 1. Detecta intención (lo que hacía RouterAgent)
 * 2. Genera query enriquecida con contexto del historial
 * 3. Genera query HyDE (respuesta hipotética para búsqueda inversa)
 * 4. Genera queries alternativas (vocabulario técnico, coloquial, amplio)
 * 5. Extrae keywords para BM25
 *
 * @module AIAgentServices/QueryEnrichmentAgent
 */

import { IntentType, ClassificationResult } from "./RouterAgentService";
import AgentLogService from "./AgentLogService";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[QueryEnrichment]";

// ============================================================================
// INTERFACES
// ============================================================================

export interface EnrichmentRequest {
  message: string;
  companyId: number;
  ticketId?: number;
  contactId?: number;
  ticketHistory?: Array<{ role: string; content: string }>;
  contactInfo?: Record<string, unknown>;
}

export interface EnrichmentResult {
  // Clasificación (reemplaza RouterAgent)
  intent: IntentType;
  confidence: number;
  targetAgent: string;
  entities: Record<string, string>;
  urgency: "low" | "medium" | "high" | "critical";

  // Enriquecimiento
  enrichedQuery: string;
  hydeQuery: string;
  alternativeQueries: string[];
  keywords: string[];
  contextInferred: string;

  // Meta
  language: string;
  modelUsed: string;
  latencyMs: number;
  cacheHit: boolean;
}

// ============================================================================
// QUICK CLASSIFY (sin LLM — conservado de RouterAgentService)
// ============================================================================

const quickClassify = (input: string): Partial<EnrichmentResult> | null => {
  const lower = input.toLowerCase().trim();

  // Detectar contenido sustantivo (pregunta o producto)
  const hasQuestion = lower.includes("?");
  const substantiveWords = [
    "tienes", "tienen", "tenés", "cuanto", "cuánto", "cuantos", "cuántos",
    "donde", "dónde", "como", "cómo", "hay", "vendes", "venden", "vende",
    "precio", "precios", "cuesta", "cuestan", "vale", "valen",
    "disponible", "disponibles", "stock", "existencia",
    "horario", "horarios", "abierto", "abierta", "abre", "abren", "cierra", "cierran",
    "envio", "envío", "envios", "envíos", "delivery", "despacho",
    "cual", "cuál", "cuales", "cuáles", "que", "qué",
    "cuando", "cuándo", "quien", "quién", "quienes", "quiénes",
    "necesito", "busco", "quiero", "quisiera", "podría", "puede", "pueden",
    "ofrecen", "ofreces", "manejan", "manejas", "trabajan", "trabajas",
    "servicio", "servicios", "producto", "productos", "catalogo", "catálogo",
    "información", "informacion", "info", "datos", "cotización", "cotizacion",
    "promoción", "promocion", "oferta", "ofertas", "descuento", "descuentos",
    "garantía", "garantia", "devolución", "devolucion", "cambio", "cambios"
  ];
  const hasSubstantiveContent = substantiveWords.some(w => lower.includes(w));

  // Saludos PUROS (sin pregunta)
  const greetings = ["hola", "buenos días", "buenas tardes", "buenas noches", "hi", "hello", "hey", "buen día"];
  if (greetings.some(g => lower.startsWith(g)) && lower.split(/\s+/).length <= 4
      && !hasQuestion && !hasSubstantiveContent) {
    return {
      intent: "greeting", confidence: 0.95, targetAgent: "self",
      enrichedQuery: input, hydeQuery: "", alternativeQueries: [], keywords: [],
      contextInferred: "Saludo puro detectado por patrón", modelUsed: "pattern-match",
      latencyMs: 0, cacheHit: false
    };
  }

  // Despedidas
  const farewells = ["gracias", "chao", "adiós", "bye", "hasta luego", "nos vemos"];
  if (farewells.some(f => lower.startsWith(f)) && lower.split(/\s+/).length <= 5) {
    return {
      intent: "farewell", confidence: 0.95, targetAgent: "self",
      enrichedQuery: input, hydeQuery: "", alternativeQueries: [], keywords: [],
      contextInferred: "Despedida detectada por patrón", modelUsed: "pattern-match",
      latencyMs: 0, cacheHit: false
    };
  }

  // Escalación explícita
  const escalationPhrases = [
    "quiero hablar con un humano", "agente humano", "persona real",
    "no quiero bot", "hablar con alguien", "operador", "representante"
  ];
  if (escalationPhrases.some(p => lower.includes(p))) {
    return {
      intent: "escalation", confidence: 0.98, targetAgent: "escalation",
      enrichedQuery: input, hydeQuery: "", alternativeQueries: [], keywords: [],
      contextInferred: "Solicitud explícita de agente humano", modelUsed: "pattern-match",
      latencyMs: 0, cacheHit: false
    };
  }

  // Citas
  const appointmentKeywords = ["agendar", "cita", "turno", "reservar", "separar", "programar"];
  if (appointmentKeywords.some(k => lower.includes(k))) {
    return {
      intent: "appointment_request", confidence: 0.9, targetAgent: "appointment",
      enrichedQuery: input, hydeQuery: "", alternativeQueries: [], keywords: [],
      contextInferred: "Solicitud de cita detectada por patrón", modelUsed: "pattern-match",
      latencyMs: 0, cacheHit: false
    };
  }

  return null; // No matcheó → necesita LLM
};

// ============================================================================
// MAPEO INTENCIÓN → AGENTE
// ============================================================================

const mapIntentToAgent = (intent: string): string => {
  const mapping: Record<string, string> = {
    "rag_query": "rag", "support_request": "support", "sales_inquiry": "sales",
    "escalation": "escalation", "greeting": "self", "farewell": "self",
    "appointment_request": "appointment", "appointment_reschedule": "appointment",
    "appointment_cancel": "appointment", "billing_inquiry": "sales",
    "complaint": "support", "feedback": "rag", "product_info": "rag",
    "order_status": "support", "refund_request": "sales",
    "cotizacion": "rag", "soporte_tecnico": "support",
    "queja": "support", "seguimiento": "support",
    "informacion_general": "rag", "saludo": "self",
    "general": "rag"
  };
  return mapping[intent] || "rag";
};

// ============================================================================
// PROMPT DE ENRIQUECIMIENTO
// ============================================================================

function buildEnrichmentPrompt(
  message: string,
  ticketHistory: Array<{ role: string; content: string }>,
  contactInfo: Record<string, unknown>
): string {
  const historyText = ticketHistory.length > 0
    ? ticketHistory.slice(-6).map(m =>
        `${m.role === "assistant" ? "AGENTE" : "CLIENTE"}: ${m.content}`
      ).join("\n")
    : "(Sin historial previo)";

  const contactText = contactInfo && Object.keys(contactInfo).length > 0
    ? Object.entries(contactInfo)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "(Sin datos del cliente)";

  return `Eres un agente de preprocesamiento para un sistema de atención al cliente.
Tu trabajo es analizar el mensaje del cliente con su contexto y generar un JSON de salida.

## ENTRADA
- Mensaje del cliente: "${message}"
- Historial de conversación:
${historyText}
- Datos del cliente: ${contactText}

## TU TAREA
Responde SOLO con un JSON válido (sin markdown, sin backticks):

{
  "intencion_detectada": "cotizacion|soporte_tecnico|queja|seguimiento|informacion_general|product_info|sales_inquiry|rag_query|general",
  "confianza_intencion": 0.0 a 1.0,
  "query_enriquecido": "Oración completa que reformula lo que el cliente realmente quiere, usando el contexto del historial",
  "query_hipotetico_hyde": "2-3 oraciones simulando la RESPUESTA IDEAL que el agente daría. No inventes datos específicos como precios.",
  "queries_alternativos": ["variante con vocabulario técnico", "variante coloquial", "variante más amplia"],
  "keywords_extraidas": ["palabra1", "palabra2", "palabra3"],
  "contexto_inferido": "Breve explicación de cómo interpretaste el mensaje"
}

## REGLAS
1. SIEMPRE genera query_enriquecido aunque el mensaje sea claro
2. Para query_hipotetico_hyde, escribe como si fueras el agente respondiendo. NO inventes precios ni datos
3. USA el historial para entender mensajes cortos ("si", "una moto", "auto")
4. Si el mensaje es ambiguo (confianza < 0.5), indícalo en contexto_inferido
5. keywords_extraidas deben incluir sinónimos relevantes`;
}

// ============================================================================
// FUNCIÓN PRINCIPAL: ENRICH
// ============================================================================

const enrich = async (request: EnrichmentRequest): Promise<EnrichmentResult> => {
  const startTime = Date.now();
  const {
    message, companyId, ticketId, contactId,
    ticketHistory = [], contactInfo = {}
  } = request;

  // 1. Intentar clasificación rápida por patrones (sin LLM)
  const quickResult = quickClassify(message);
  if (quickResult) {
    logger.info(`${SERVICE_PREFIX} Clasificación rápida: ${quickResult.intent} (${quickResult.confidence})`);
    return {
      intent: quickResult.intent as IntentType || "general",
      confidence: quickResult.confidence || 0.95,
      targetAgent: quickResult.targetAgent || "self",
      entities: {},
      urgency: "low",
      enrichedQuery: quickResult.enrichedQuery || message,
      hydeQuery: quickResult.hydeQuery || "",
      alternativeQueries: quickResult.alternativeQueries || [],
      keywords: quickResult.keywords || [],
      contextInferred: quickResult.contextInferred || "",
      language: "es",
      modelUsed: "pattern-match",
      latencyMs: Date.now() - startTime,
      cacheHit: false
    };
  }

  // 2. Enriquecimiento por LLM
  let result: EnrichmentResult;
  try {
    const { chatCompletion } = require("../AIClientService");

    const prompt = buildEnrichmentPrompt(message, ticketHistory, contactInfo);

    const llmResponse = await chatCompletion({
      messages: [
        { role: "system", content: "Responde SOLO con JSON válido. Sin markdown, sin backticks, sin explicación." },
        { role: "user", content: prompt }
      ],
      maxTokens: 500,
      temperature: 0.1,
      companyId,
      module: "classification"
    });

    const modelUsed = llmResponse.model || "unknown";

    // Parsear respuesta JSON
    let parsed: any;
    try {
      const text = llmResponse.content?.trim() || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      logger.warn(`${SERVICE_PREFIX} Error parseando JSON, usando fallback heurístico`);
      parsed = {};
    }

    const intent = (parsed.intencion_detectada || "general") as IntentType;

    result = {
      intent,
      confidence: parsed.confianza_intencion || 0.5,
      targetAgent: mapIntentToAgent(intent),
      entities: {},
      urgency: "medium",
      enrichedQuery: parsed.query_enriquecido || message,
      hydeQuery: parsed.query_hipotetico_hyde || "",
      alternativeQueries: Array.isArray(parsed.queries_alternativos) ? parsed.queries_alternativos : [],
      keywords: Array.isArray(parsed.keywords_extraidas) ? parsed.keywords_extraidas : [],
      contextInferred: parsed.contexto_inferido || "",
      language: "es",
      modelUsed,
      latencyMs: Date.now() - startTime,
      cacheHit: false
    };

    logger.info(
      `${SERVICE_PREFIX} Enriquecido: intent=${result.intent}, confidence=${result.confidence}, ` +
      `agent=${result.targetAgent}, enrichedQuery="${result.enrichedQuery.substring(0, 60)}...", ` +
      `keywords=[${result.keywords.join(", ")}], latency=${result.latencyMs}ms`
    );
  } catch (error: any) {
    logger.error(`${SERVICE_PREFIX} Error LLM: ${error.message}`);

    // Fallback heurístico
    result = heuristicEnrich(message, ticketHistory, startTime);
  }

  // 3. Log de ejecución
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: "query_enrichment",
      modelUsed: result.modelUsed,
      inputTokens: Math.ceil(message.length / 4),
      outputTokens: 100,
      costUsd: 0.00005,
      latencyMs: result.latencyMs,
      confidence: result.confidence,
      cacheHit: result.cacheHit,
      inputSummary: message.substring(0, 200),
      outputSummary: `intent=${result.intent}, enriched="${result.enrichedQuery.substring(0, 100)}"`,
      metadata: {
        keywords: result.keywords,
        alternativeQueries: result.alternativeQueries.length,
        contextInferred: result.contextInferred.substring(0, 200)
      }
    });
  } catch (logErr: any) {
    logger.warn(`${SERVICE_PREFIX} Error en log: ${logErr.message}`);
  }

  return result;
};

// ============================================================================
// FALLBACK HEURÍSTICO (sin LLM)
// ============================================================================

function heuristicEnrich(
  message: string,
  ticketHistory: Array<{ role: string; content: string }>,
  startTime: number
): EnrichmentResult {
  const lower = message.toLowerCase();

  // Enriquecer con historial
  let enrichedQuery = message;
  if (message.trim().split(/\s+/).length <= 4 && ticketHistory.length > 0) {
    const context = ticketHistory.slice(-4)
      .map(m => m.content)
      .filter(c => c && c.length > 3)
      .join(" ");
    enrichedQuery = `${context} ${message}`.trim();
  }

  // Extraer keywords simples
  const keywords = lower.split(/\s+/).filter(w => w.length > 3);

  // Determinar intención básica
  let intent: IntentType = "general";
  if (lower.match(/precio|costo|cuanto|cuánto|cotiz/)) intent = "sales_inquiry";
  else if (lower.match(/no funciona|no sirve|error|falla|problema/)) intent = "support_request";
  else if (lower.match(/gps|plan|producto|servicio/)) intent = "product_info";

  return {
    intent,
    confidence: 0.4,
    targetAgent: mapIntentToAgent(intent),
    entities: {},
    urgency: "medium",
    enrichedQuery,
    hydeQuery: "",
    alternativeQueries: [],
    keywords,
    contextInferred: "Clasificación heurística (LLM no disponible)",
    language: "es",
    modelUsed: "heuristic",
    latencyMs: Date.now() - startTime,
    cacheHit: false
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { quickClassify, mapIntentToAgent };

export default {
  enrich,
  quickClassify,
  mapIntentToAgent
};
