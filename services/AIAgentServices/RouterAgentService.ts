import { selectModel, classifyComplexity } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import SemanticCacheService from "../RAGServices/SemanticCacheService";
import EmbeddingService from "../RAGServices/EmbeddingService";
import logger from "../../utils/logger";

/**
 * Router Agent — Clasificador de intención y orquestador
 *
 * Responsabilidades:
 * 1. Clasificar la intención del mensaje del usuario
 * 2. Determinar qué agente especializado debe manejar la solicitud
 * 3. Extraer entidades relevantes (nombre, producto, número de orden, etc.)
 * 4. Determinar el nivel de urgencia
 *
 * Tipos de intención soportados:
 * - rag_query: Pregunta que requiere búsqueda en Knowledge Base
 * - support_request: Solicitud de soporte técnico o troubleshooting
 * - sales_inquiry: Consulta comercial, precios, planes
 * - escalation: Solicitud explícita de hablar con un humano
 * - greeting: Saludo simple
 * - farewell: Despedida
 * - general: Consulta general sin clasificación específica
 */

export type IntentType =
  | 'rag_query'
  | 'support_request'
  | 'sales_inquiry'
  | 'escalation'
  | 'greeting'
  | 'farewell'
  | 'appointment_request'
  | 'appointment_reschedule'
  | 'appointment_cancel'
  | 'billing_inquiry'
  | 'complaint'
  | 'feedback'
  | 'product_info'
  | 'order_status'
  | 'refund_request'
  | 'general';

export interface ClassificationResult {
  intent: IntentType;
  confidence: number;
  targetAgent: string; // 'rag' | 'support' | 'sales' | 'escalation' | 'self'
  entities: Record<string, string>;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  language: string;
  modelUsed: string;
  latencyMs: number;
  cacheHit: boolean;
}

// Clasificación rápida por patrones (sin LLM, ultra-rápido)
const quickClassify = (input: string): ClassificationResult | null => {
  const lower = input.toLowerCase().trim();

  // Saludos — SOLO si es saludo PURO (sin pregunta ni contenido sustantivo)
  const greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hi', 'hello', 'hey', 'buen día'];

  // Detectar si el mensaje contiene una pregunta o contenido que requiere RAG/LLM
  const hasQuestion = lower.includes('?');
  const substantiveWords = [
    'tienes', 'tienen', 'tenés', 'cuanto', 'cuánto', 'cuantos', 'cuántos',
    'donde', 'dónde', 'como', 'cómo', 'hay', 'vendes', 'venden', 'vende',
    'precio', 'precios', 'cuesta', 'cuestan', 'vale', 'valen',
    'disponible', 'disponibles', 'stock', 'existencia',
    'horario', 'horarios', 'abierto', 'abierta', 'abre', 'abren', 'cierra', 'cierran',
    'envio', 'envío', 'envios', 'envíos', 'delivery', 'despacho',
    'cual', 'cuál', 'cuales', 'cuáles', 'que', 'qué',
    'cuando', 'cuándo', 'quien', 'quién', 'quienes', 'quiénes',
    'necesito', 'busco', 'quiero', 'quisiera', 'podría', 'puede', 'pueden',
    'ofrecen', 'ofreces', 'manejan', 'manejas', 'trabajan', 'trabajas',
    'servicio', 'servicios', 'producto', 'productos', 'catalogo', 'catálogo',
    'información', 'informacion', 'info', 'datos', 'cotización', 'cotizacion',
    'promoción', 'promocion', 'oferta', 'ofertas', 'descuento', 'descuentos',
    'garantía', 'garantia', 'devolución', 'devolucion', 'cambio', 'cambios'
  ];
  const hasSubstantiveContent = substantiveWords.some(w => lower.includes(w));

  if (greetings.some(g => lower.startsWith(g)) && lower.split(/\s+/).length <= 4
      && !hasQuestion && !hasSubstantiveContent) {
    logger.info(`[RouterAgent] Clasificación rápida: greeting puro (sin pregunta)`);
    return {
      intent: 'greeting',
      confidence: 0.95,
      targetAgent: 'self',
      entities: {},
      urgency: 'low',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  // Despedidas
  const farewells = ['gracias', 'chao', 'adiós', 'bye', 'hasta luego', 'nos vemos'];
  if (farewells.some(f => lower.startsWith(f)) && lower.split(/\s+/).length <= 5) {
    return {
      intent: 'farewell',
      confidence: 0.95,
      targetAgent: 'self',
      entities: {},
      urgency: 'low',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  // Escalación explícita
  const escalationPhrases = [
    'quiero hablar con un humano', 'agente humano', 'persona real',
    'no quiero bot', 'hablar con alguien', 'operador', 'representante',
    'talk to a human', 'real person', 'agent please'
  ];
  if (escalationPhrases.some(p => lower.includes(p))) {
    return {
      intent: 'escalation',
      confidence: 0.98,
      targetAgent: 'escalation',
      entities: {},
      urgency: 'high',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  // Intenciones de citas - Agendar
  const appointmentCreateKeywords = [
    'agendar', 'cita', 'turno', 'reservar', 'separar', 'programar',
    'quiero una cita', 'necesito una cita', 'sacar cita'
  ];
  if (appointmentCreateKeywords.some(k => lower.includes(k))) {
    return {
      intent: 'appointment_request',
      confidence: 0.9,
      targetAgent: 'appointment',
      entities: {},
      urgency: 'medium',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  // Intenciones de citas - Reagendar
  const appointmentRescheduleKeywords = [
    'reagendar', 'cambiar', 'modificar', 'mover', 'reprogramar',
    'cambiar cita', 'cambiar hora', 'otra fecha'
  ];
  if (appointmentRescheduleKeywords.some(k => lower.includes(k))) {
    return {
      intent: 'appointment_reschedule',
      confidence: 0.9,
      targetAgent: 'appointment',
      entities: {},
      urgency: 'medium',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  // Intenciones de citas - Cancelar
  const appointmentCancelKeywords = [
    'cancelar', 'anular', 'eliminar', 'borrar',
    'cancelar cita', 'anular cita', 'no puedo', 'ya no puedo'
  ];
  if (appointmentCancelKeywords.some(k => lower.includes(k))) {
    return {
      intent: 'appointment_cancel',
      confidence: 0.9,
      targetAgent: 'appointment',
      entities: {},
      urgency: 'medium',
      language: 'es',
      modelUsed: 'pattern-match',
      latencyMs: 0,
      cacheHit: false
    };
  }

  return null; // No match → necesita LLM
};

/**
 * Clasifica la intención de un mensaje usando el Router Agent
 */
const classify = async (
  input: string,
  companyId: number,
  ticketId?: number,
  contactId?: number
): Promise<ClassificationResult> => {
  const startTime = Date.now();

  // 1. Intentar clasificación rápida por patrones
  const quickResult = quickClassify(input);
  if (quickResult) {
    logger.info(`[RouterAgent] Clasificación rápida: ${quickResult.intent} (${quickResult.confidence})`);
    return quickResult;
  }

  // 2. Verificar cache semántico
  const cacheResult = await SemanticCacheService.lookup(
    `intent:${input}`,
    companyId
  );

  if (cacheResult) {
    const cached = JSON.parse(cacheResult.response) as ClassificationResult;
    cached.cacheHit = true;
    cached.latencyMs = Date.now() - startTime;
    logger.info(`[RouterAgent] Cache hit: ${cached.intent}`);
    return cached;
  }

  // 3. Clasificación por LLM (Model Router selecciona modelo)
  const modelSelection = await selectModel('router', input, 'nano');

  // Construir el prompt de clasificación
  const classificationPrompt = buildClassificationPrompt(input);

  // Cargar systemPrompt personalizado de BD (si existe)
  let dbSystemPrompt: string | undefined;
  try {
    const AIAgentConfig = require("../../models/AIAgentConfig").default;
    const agentConfig = await AIAgentConfig.findOne({ where: { slug: 'router-inteligente' } });
    if (agentConfig?.systemPrompt) {
      dbSystemPrompt = agentConfig.systemPrompt;
    }
  } catch (configErr: any) {
    logger.warn(`[RouterAgent] No se pudo cargar config de BD: ${configErr.message}`);
  }

  // Llamar al LLM via AIClientService existente
  let result: ClassificationResult;
  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt: classificationPrompt,
      systemPrompt: dbSystemPrompt,
      modelKey: modelSelection?.entity.key || 'gpt-4.1-mini',
      maxTokens: 200,
      temperature: 0.1, // Baja temperatura para clasificación determinista
      responseFormat: 'json'
    });

    const parsed = JSON.parse(llmResponse.text);

    result = {
      intent: parsed.intent || 'general',
      confidence: parsed.confidence || 0.5,
      targetAgent: mapIntentToAgent(parsed.intent),
      entities: parsed.entities || {},
      urgency: parsed.urgency || 'medium',
      language: parsed.language || 'es',
      modelUsed: modelSelection?.entity.key || 'gpt-4.1-mini',
      latencyMs: Date.now() - startTime,
      cacheHit: false
    };
  } catch (error: any) {
    logger.error(`[RouterAgent] Error en clasificación LLM: ${error.message}`);

    // Fallback: clasificación heurística básica
    result = heuristicClassify(input, startTime);
  }

  // 4. Guardar en cache semántico (TTL 1 hora)
  try {
    const queryEmbedding = await EmbeddingService.generateEmbedding(input, companyId);
    await SemanticCacheService.store(
      `intent:${input}`,
      queryEmbedding,
      JSON.stringify(result),
      companyId,
      {
        modelUsed: result.modelUsed,
        agentUsed: 'router',
        tokensInput: Math.ceil(input.length / 4),
        tokensOutput: 50,
        costUsd: 0.00001
      }
    );
  } catch (cacheError: any) {
    logger.warn(`[RouterAgent] Error al cachear: ${cacheError.message}`);
  }

  // 5. Registrar log de ejecución
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'router',
      modelUsed: result.modelUsed,
      inputTokens: Math.ceil(input.length / 4),
      outputTokens: 50,
      costUsd: 0.00001, // Costo mínimo para nano models
      latencyMs: result.latencyMs,
      confidence: result.confidence,
      cacheHit: result.cacheHit,
      inputSummary: input.substring(0, 200),
      outputSummary: `intent=${result.intent}, agent=${result.targetAgent}`,
      metadata: { entities: result.entities, urgency: result.urgency }
    });
  } catch (logError: any) {
    logger.warn(`[RouterAgent] Error al registrar log: ${logError.message}`);
  }

  logger.info(
    `[RouterAgent] Clasificado: intent=${result.intent}, confidence=${result.confidence}, ` +
    `agent=${result.targetAgent}, latency=${result.latencyMs}ms`
  );

  return result;
};

/**
 * Construye el prompt de clasificación para el LLM
 */
function buildClassificationPrompt(input: string): string {
  return `Eres un clasificador de intenciones para un sistema CRM omnicanal.
Analiza el mensaje del usuario y responde SOLO en JSON con este formato exacto:

{
  "intent": "rag_query|support_request|sales_inquiry|escalation|greeting|farewell|appointment_request|appointment_reschedule|appointment_cancel|billing_inquiry|complaint|feedback|product_info|order_status|refund_request|general",
  "confidence": 0.0-1.0,
  "entities": {"key": "value"},
  "urgency": "low|medium|high|critical",
  "language": "es|en|pt"
}

Reglas:
- rag_query: Preguntas sobre información, documentación, FAQs
- support_request: Problemas técnicos, errores, troubleshooting
- sales_inquiry: Precios, planes, compras, presupuestos
- escalation: Solicitud explícita de hablar con humano
- appointment_request: Solicitar agendar una cita, turno, reserva
- appointment_reschedule: Cambiar/modificar/reagendar una cita existente
- appointment_cancel: Cancelar/anular una cita existente
- billing_inquiry: Consultas sobre facturas, pagos, métodos de pago
- complaint: Quejas, problemas con el servicio, frustración
- feedback: Opiniones, sugerencias, reseñas
- product_info: Información sobre productos o servicios específicos
- order_status: Seguimiento de pedidos, estado de entrega
- refund_request: Solicitudes de reembolso, devoluciones
- greeting/farewell: Saludos y despedidas
- general: Todo lo demás

Mensaje del usuario: "${input}"`;
}

/**
 * Mapea una intención al agente especializado
 */
function mapIntentToAgent(intent: string): string {
  const mapping: Record<string, string> = {
    'rag_query': 'rag',
    'support_request': 'support',
    'sales_inquiry': 'sales',
    'escalation': 'escalation',
    'greeting': 'self',
    'farewell': 'self',
    'appointment_request': 'appointment',
    'appointment_reschedule': 'appointment',
    'appointment_cancel': 'appointment',
    'billing_inquiry': 'sales',  // Consultas de facturación -> agente ventas
    'complaint': 'support',      // Quejas -> soporte
    'feedback': 'rag',           // Feedback -> RAG
    'product_info': 'rag',      // Info productos -> RAG
    'order_status': 'support', // Estado pedido -> soporte
    'refund_request': 'sales',  // Reembolsos -> ventas
    'general': 'rag'            // Default: intentar responder con RAG
  };
  return mapping[intent] || 'rag';
}

/**
 * Clasificación heurística de fallback (sin LLM)
 */
function heuristicClassify(input: string, startTime: number): ClassificationResult {
  const lower = input.toLowerCase();

  // Palabras clave de soporte
  const supportKeywords = ['error', 'problema', 'no funciona', 'bug', 'falla', 'ayuda', 'issue', 'broken'];
  // Palabras clave de ventas
  const salesKeywords = ['precio', 'plan', 'costo', 'comprar', 'cotización', 'presupuesto', 'price', 'buy'];
  // Palabras clave de RAG
  const ragKeywords = ['cómo', 'qué es', 'dónde', 'cuándo', 'por qué', 'información', 'how', 'what', 'where'];

  let intent: IntentType = 'general';
  let targetAgent = 'rag';

  if (supportKeywords.some(kw => lower.includes(kw))) {
    intent = 'support_request';
    targetAgent = 'support';
  } else if (salesKeywords.some(kw => lower.includes(kw))) {
    intent = 'sales_inquiry';
    targetAgent = 'sales';
  } else if (ragKeywords.some(kw => lower.includes(kw))) {
    intent = 'rag_query';
    targetAgent = 'rag';
  }

  return {
    intent,
    confidence: 0.6,
    targetAgent,
    entities: {},
    urgency: 'medium',
    language: 'es',
    modelUsed: 'heuristic',
    latencyMs: Date.now() - startTime,
    cacheHit: false
  };
}

export default {
  classify,
  quickClassify,
  classifyComplexity,
  mapIntentToAgent
};
