import { selectModel } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import logger from "../../utils/logger";

/**
 * Escalation Agent -- Agente de escalacion a humano con preparacion de contexto
 *
 * Responsabilidades:
 * 1. Evaluar si una conversacion debe ser transferida a un agente humano
 * 2. Detectar triggers de escalacion (sentimiento negativo, baja confianza, etc.)
 * 3. Preparar un resumen completo para el agente humano
 * 4. Sugerir la queue apropiada para la transferencia
 */

export interface EscalationResponse {
  shouldEscalate: boolean;
  escalationReason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  summary: string;           // Summary for the human agent
  suggestedQueue: string;    // Queue to transfer to
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'angry';
  previousAttempts: number;
  responseToUser: string;    // Message to send to user during transfer
  confidence: number;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

export type EscalationTrigger =
  | 'user_request'          // User explicitly asked for human
  | 'low_confidence'        // Agent confidence < 0.5
  | 'negative_sentiment'    // Persistent negative sentiment (>3 messages)
  | 'unresolved_issue'      // Not resolved in >5 exchanges
  | 'sensitive_topic'       // Billing, legal, cancellation
  | 'agent_loop'            // Agent repeating same response
  | 'complex_query';        // Query too complex for AI

const evaluate = async (
  message: string,
  companyId: number,
  context: {
    ticketId?: number;
    contactId?: number;
    ticketHistory?: string;
    contactInfo?: Record<string, any>;
    previousAgentType?: string;
    previousConfidence?: number;
    messageCount?: number;
    trigger?: EscalationTrigger;
  } = {}
): Promise<EscalationResponse> => {
  const startTime = Date.now();
  const { ticketId, contactId, ticketHistory, contactInfo, trigger } = context;

  // Quick escalation for explicit user requests
  if (trigger === 'user_request') {
    const quickResponse = buildQuickEscalation('user_request', message, startTime);
    await logEscalation(companyId, ticketId, contactId, quickResponse, message);
    return quickResponse;
  }

  // Quick escalation for very low confidence
  if (context.previousConfidence !== undefined && context.previousConfidence < 0.3) {
    const quickResponse = buildQuickEscalation('low_confidence', message, startTime);
    await logEscalation(companyId, ticketId, contactId, quickResponse, message);
    return quickResponse;
  }

  // LLM-based evaluation for complex cases
  const modelSelection = await selectModel('escalation', message, 'mini');
  const modelKey = modelSelection?.entity.key || 'gpt-4.1-mini';

  // Cargar systemPrompt personalizado de BD (si existe)
  let dbSystemPrompt: string | undefined;
  try {
    const AIAgentConfig = require("../../models/AIAgentConfig").default;
    const agentConfig = await AIAgentConfig.findOne({ where: { slug: 'escalacion-inteligente' } });
    if (agentConfig?.systemPrompt) {
      dbSystemPrompt = agentConfig.systemPrompt;
    }
  } catch (configErr: any) {
    logger.warn(`[EscalationAgent] No se pudo cargar config de BD: ${configErr.message}`);
  }

  let response: EscalationResponse;
  try {
    const AIClientService = require("../AIClientService").default;
    const prompt = buildEscalationPrompt(message, context);

    const llmResponse = await AIClientService.generateText({
      prompt,
      systemPrompt: dbSystemPrompt,
      modelKey,
      maxTokens: 512,
      temperature: 0.2,
      responseFormat: 'json'
    });

    const parsed = JSON.parse(llmResponse.text);

    response = {
      shouldEscalate: parsed.shouldEscalate !== false,
      escalationReason: parsed.escalationReason || trigger || 'complex_query',
      urgency: parsed.urgency || 'medium',
      summary: parsed.summary || `Cliente solicita atencion: ${message.substring(0, 100)}`,
      suggestedQueue: parsed.suggestedQueue || 'general',
      customerSentiment: parsed.customerSentiment || 'neutral',
      previousAttempts: context.messageCount || 0,
      responseToUser: parsed.responseToUser || "Te estoy transfiriendo con un agente humano que podra ayudarte mejor. Un momento por favor.",
      confidence: parsed.confidence || 0.8,
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil(llmResponse.text.length / 4)
      }
    };
  } catch (error: any) {
    logger.error(`[EscalationAgent] Error en LLM: ${error.message}`);

    response = {
      shouldEscalate: true,
      escalationReason: trigger || 'agent_error',
      urgency: 'high',
      summary: `Error en agente IA. Mensaje del cliente: ${message.substring(0, 200)}`,
      suggestedQueue: 'general',
      customerSentiment: 'neutral',
      previousAttempts: context.messageCount || 0,
      responseToUser: "Disculpa las molestias, te estoy conectando con un agente que podra asistirte. Un momento.",
      confidence: 0.5,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }

  await logEscalation(companyId, ticketId, contactId, response, message);

  logger.info(
    `[EscalationAgent] Resultado: escalate=${response.shouldEscalate}, ` +
    `reason=${response.escalationReason}, urgency=${response.urgency}, ` +
    `sentiment=${response.customerSentiment}, latency=${response.latencyMs}ms`
  );

  return response;
};

function buildQuickEscalation(
  trigger: EscalationTrigger,
  message: string,
  startTime: number
): EscalationResponse {
  const messages: Record<string, string> = {
    'user_request': "Por supuesto, te conecto con un agente humano ahora mismo. Un momento por favor.",
    'low_confidence': "Para darte la mejor atencion posible, te voy a transferir con un especialista. Un momento.",
    'negative_sentiment': "Entiendo tu frustracion. Te conecto con un agente que podra ayudarte directamente.",
    'agent_loop': "Veo que no estoy pudiendo resolver tu consulta. Te transfiero con un agente humano."
  };

  return {
    shouldEscalate: true,
    escalationReason: trigger,
    urgency: trigger === 'user_request' ? 'high' : 'medium',
    summary: `Escalacion automatica (${trigger}): ${message.substring(0, 200)}`,
    suggestedQueue: 'general',
    customerSentiment: trigger === 'negative_sentiment' ? 'negative' : 'neutral',
    previousAttempts: 0,
    responseToUser: messages[trigger] || messages['user_request'],
    confidence: 0.95,
    modelUsed: 'rule-based',
    latencyMs: Date.now() - startTime,
    tokensUsed: { input: 0, output: 0 }
  };
}

function buildEscalationPrompt(
  message: string,
  context: Record<string, any>
): string {
  let contextSection = "";
  if (context.ticketHistory) {
    contextSection += `\nHISTORIAL:\n${context.ticketHistory}\n`;
  }
  if (context.contactInfo) {
    contextSection += `\nCONTACTO:\n${JSON.stringify(context.contactInfo, null, 2)}\n`;
  }
  if (context.previousAgentType) {
    contextSection += `\nAGENTE PREVIO: ${context.previousAgentType} (confidence: ${context.previousConfidence})\n`;
  }

  return `Eres un agente de escalacion para un CRM omnicanal.
Tu trabajo es evaluar si una conversacion debe ser transferida a un agente humano.

CRITERIOS DE ESCALACION:
1. Sentimiento negativo persistente (>3 mensajes negativos)
2. Confidence del agente previo < 0.5
3. Solicitud explicita del usuario de hablar con humano
4. Problema no resuelto en >5 intercambios
5. Temas sensibles: facturacion, legal, cancelacion, quejas formales
6. Consulta demasiado compleja para IA

REGLAS:
- Prepara un resumen claro y conciso para el agente humano
- Indica la urgencia correcta basada en el contexto
- Sugiere la queue apropiada (general, ventas, soporte, facturacion)
- Detecta el sentimiento del cliente
- Siempre da una respuesta empatica al usuario
${contextSection}

MENSAJE ACTUAL: "${message}"

Responde SOLO en JSON:
{
  "shouldEscalate": true/false,
  "escalationReason": "user_request|low_confidence|negative_sentiment|unresolved_issue|sensitive_topic|complex_query",
  "urgency": "low|medium|high|critical",
  "summary": "Resumen para el agente humano",
  "suggestedQueue": "general|ventas|soporte|facturacion",
  "customerSentiment": "positive|neutral|negative|angry",
  "responseToUser": "Mensaje para el usuario",
  "confidence": 0.0-1.0
}`;
}

async function logEscalation(
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  response: EscalationResponse,
  message: string
): Promise<void> {
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'escalation',
      modelUsed: response.modelUsed,
      inputTokens: response.tokensUsed.input,
      outputTokens: response.tokensUsed.output,
      costUsd: 0,
      latencyMs: response.latencyMs,
      confidence: response.confidence,
      wasEscalated: response.shouldEscalate,
      escalationReason: response.escalationReason,
      cacheHit: false,
      inputSummary: message.substring(0, 200),
      outputSummary: response.summary.substring(0, 200),
      metadata: {
        urgency: response.urgency,
        sentiment: response.customerSentiment,
        suggestedQueue: response.suggestedQueue
      }
    });
  } catch (error: any) {
    logger.warn(`[EscalationAgent] Error al registrar log: ${error.message}`);
  }
}

export default { evaluate };
