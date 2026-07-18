import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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

/**
 * Entidades temporales resueltas a fechas/horas absolutas.
 * El enriquecedor transforma "mañana", "el lunes", "en una semana" en valores
 * concretos para que el AppointmentAgent no tenga que inferir.
 */
export interface TemporalEntities {
  /** Texto original del cliente (ej: "mañana", "el lunes a las 3") */
  originalText?: string;
  /** Fecha absoluta resuelta en formato YYYY-MM-DD (timezone del company) */
  resolvedDate?: string;
  /** Hora resuelta en formato HH:mm 24h, si se mencionó */
  resolvedTime?: string;
  /** Timezone usado para la resolución (IANA) */
  timezone?: string;
}

export interface EnrichmentResult {
  // Clasificación (reemplaza RouterAgent)
  intent: IntentType;
  confidence: number;
  targetAgent: string;
  entities: Record<string, string>;
  /** Entidades temporales resueltas (fechas/horas absolutas) */
  temporalEntities?: TemporalEntities;
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
  contactInfo: Record<string, unknown>,
  now: Date,
  companyTimezone: string
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

  // 🆕 Bug C fix: contexto temporal del sistema para resolver términos relativos
  // ("mañana", "el lunes", "hoy") a fechas absolutas en la zona horaria del company.
  const nowInTz = now.toLocaleString("es-ES", {
    timeZone: companyTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: companyTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now); // YYYY-MM-DD

  return `Eres un agente de preprocesamiento para un sistema de atención al cliente.
Tu trabajo es analizar el mensaje del cliente con su contexto y generar un JSON de salida.

## CONTEXTO TEMPORAL (usar para resolver términos relativos)
- Fecha/hora actual (timezone empresa): ${nowInTz}
- Hoy (YYYY-MM-DD): ${todayIso}
- Timezone de la empresa: ${companyTimezone}

## ENTRADA
- Mensaje del cliente: "${message}"
- Historial de conversación:
${historyText}
- Datos del cliente: ${contactText}

## TU TAREA
Responde SOLO con un JSON válido (sin markdown, sin backticks):

{
  "intencion_detectada": "cotizacion|soporte_tecnico|queja|seguimiento|informacion_general|product_info|sales_inquiry|rag_query|general|appointment_request",
  "confianza_intencion": 0.0 a 1.0,
  "query_enriquecido": "Oración completa que reformula lo que el cliente realmente quiere, usando el contexto del historial",
  "query_hipotetico_hyde": "2-3 oraciones simulando la RESPUESTA IDEAL que el agente daría. No inventes datos específicos como precios.",
  "queries_alternativos": ["variante con vocabulario técnico", "variante coloquial", "variante más amplia"],
  "keywords_extraidas": ["palabra1", "palabra2", "palabra3"],
  "contexto_inferido": "Breve explicación de cómo interpretaste el mensaje",
  "entidades_temporales": {
    "texto_original": "string con lo que dijo el cliente sobre tiempo (ej: 'mañana', 'el lunes a las 3pm') o null si no mencionó nada",
    "fecha_resuelta": "YYYY-MM-DD con la fecha absoluta que implica el mensaje, o null",
    "hora_resuelta": "HH:mm 24h, o null si no mencionó hora"
  }
}

## REGLAS
1. SIEMPRE genera query_enriquecido aunque el mensaje sea claro
2. Para query_hipotetico_hyde, escribe como si fueras el agente respondiendo. NO inventes precios ni datos
3. USA el historial para entender mensajes cortos ("si", "una moto", "auto")
4. Si el mensaje es ambiguo (confianza < 0.5), indícalo en contexto_inferido
5. keywords_extraidas deben incluir sinónimos relevantes
6. entidades_temporales — REGLAS OBLIGATORIAS:
   - Si el cliente dice "mañana" → fecha_resuelta = fecha de hoy + 1 día
   - Si dice "hoy" → fecha_resuelta = hoy
   - Si dice un día de semana ("el lunes", "viernes") → la PRÓXIMA ocurrencia de ese día (si hoy es lunes y dice "lunes", es el próximo lunes)
   - Si da fecha explícita ("15 de abril") → usa esa fecha; si el año ya pasó, usa el próximo
   - Si no hay referencia temporal → null todos los campos
   - hora_resuelta: "3pm" → "15:00", "8 y media" → "08:30", "ocho de la mañana" → "08:00"
   - NUNCA inventes una fecha si el cliente no la mencionó
   - Usa SIEMPRE el timezone de la empresa para calcular`;
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

    // 🆕 Bug C fix: cargar timezone del company para resolver términos relativos
    let companyTimezone = "America/Lima"; // fallback razonable para mercado LATAM
    try {
      const Company = require("../../models/Company").default;
      const company = await Company.findByPk(companyId, { attributes: ["timezone"] });
      if (company?.timezone) companyTimezone = company.timezone;
    } catch {
      // silenciar — usar fallback
    }

    const prompt = buildEnrichmentPrompt(
      message,
      ticketHistory,
      contactInfo,
      new Date(),
      companyTimezone
    );

    const llmResponse = await chatCompletion({
      messages: [
        { role: "system", content: "Responde SOLO con JSON válido. Sin markdown, sin backticks, sin explicación." },
        { role: "user", content: prompt }
      ],
      model: "gpt-4.1-mini", // 2026-07-10: mini (NO gpt-5.5). gpt-5.5 es de razonamiento → ~8s de latencia (medido) en un paso que corre en CADA mensaje. Clasificación estructurada → mini es correcto por velocidad, no por costo.
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

    // 🆕 Bug C fix: parsear entidades temporales resueltas
    let temporalEntities: TemporalEntities | undefined;
    const rawTemporal = parsed.entidades_temporales;
    if (rawTemporal && typeof rawTemporal === 'object') {
      const hasSomething =
        rawTemporal.texto_original || rawTemporal.fecha_resuelta || rawTemporal.hora_resuelta;
      if (hasSomething) {
        temporalEntities = {
          originalText: rawTemporal.texto_original || undefined,
          resolvedDate: rawTemporal.fecha_resuelta || undefined,
          resolvedTime: rawTemporal.hora_resuelta || undefined,
          timezone: companyTimezone
        };
      }
    }

    result = {
      intent,
      confidence: parsed.confianza_intencion || 0.5,
      targetAgent: mapIntentToAgent(intent),
      entities: {},
      temporalEntities,
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

    if (temporalEntities) {
      logger.info(
        `${SERVICE_PREFIX} Entidades temporales: ` +
        `originalText="${temporalEntities.originalText}", ` +
        `resolvedDate=${temporalEntities.resolvedDate}, ` +
        `resolvedTime=${temporalEntities.resolvedTime}, ` +
        `tz=${temporalEntities.timezone}`
      );
    }

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
