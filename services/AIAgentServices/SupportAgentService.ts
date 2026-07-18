import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import RAGAgentService from "./RAGAgentService";
import { selectModel } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import logger from "../../utils/logger";

/**
 * Support Agent — Agente de soporte técnico y diagnóstico
 *
 * Responsabilidades:
 * 1. Diagnosticar problemas del usuario
 * 2. Buscar soluciones en la KB (vía RAG Agent)
 * 3. Ejecutar acciones de soporte (consultar estado de ticket, etc.)
 * 4. Escalar a humano si no puede resolver
 *
 * Diferencia con RAG Agent:
 * - Support Agent tiene contexto del ticket y puede ejecutar herramientas
 * - RAG Agent solo busca y responde información
 * - Support Agent mantiene un flujo de diagnóstico paso a paso
 */

export interface SupportResponse {
  message: string;
  actions: SupportAction[];
  shouldEscalate: boolean;
  escalationReason?: string;
  confidence: number;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  diagnosticSteps: string[];
}

export interface SupportAction {
  type: 'check_ticket_status' | 'search_kb' | 'update_ticket' | 'send_template' | 'escalate';
  description: string;
  executed: boolean;
  result?: string;
}

/**
 * Procesa una solicitud de soporte
 */
const processRequest = async (
  input: string,
  companyId: number,
  context: {
    ticketId?: number;
    contactId?: number;
    ticketHistory?: Array<{ role: string; content: string }>;
    contactInfo?: Record<string, unknown>;
    ticketContext?: string; // Contexto de tags del ticket
  } = {}
): Promise<SupportResponse> => {
  const startTime = Date.now();
  const { ticketId, contactId, ticketHistory = [], contactInfo = {}, ticketContext } = context;

  // 1. Seleccionar modelo (mini para soporte general, full para diagnóstico complejo)
  const modelSelection = await selectModel('support', input);
  const modelKey = modelSelection?.entity.key || 'gpt-5.5';

  // 2. Buscar información relevante en KB vía RAG
  let ragContext = '';
  let ragSources: any[] = [];
  try {
    const ragResult = await RAGAgentService.processQuery(input, companyId, {
      ticketId,
      contactId,
      maxResults: 3,
      ticketContext
    });

    if (ragResult.confidence > 0.3) {
      ragContext = ragResult.answer;
      ragSources = ragResult.sources;
    }
  } catch (ragError: any) {
    logger.warn(`[SupportAgent] Error en RAG: ${ragError.message}`);
  }

  // 3. Construir prompt con contexto completo
  const prompt = buildSupportPrompt(input, {
    ragContext,
    ticketHistory,
    contactInfo
  });

  // 4. Cargar systemPrompt personalizado de BD (si existe)
  let dbSystemPrompt: string | undefined;
  try {
    const AIAgentConfig = require("../../models/AIAgentConfig").default;
    const agentConfig = await AIAgentConfig.findOne({ where: { slug: 'soporte-tecnico' } });
    if (agentConfig?.systemPrompt) {
      dbSystemPrompt = agentConfig.systemPrompt;
    }
  } catch (configErr: any) {
    logger.warn(`[SupportAgent] No se pudo cargar config de BD: ${configErr.message}`);
  }

  // 5. Generar respuesta con LLM
  let response: SupportResponse;
  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt,
      systemPrompt: dbSystemPrompt,
      modelKey,
      maxTokens: 1024,
      temperature: 0.4
    });

    // Parsear respuesta del LLM
    let parsed;
    try {
      parsed = JSON.parse(llmResponse.text);
    } catch {
      // Si no es JSON, usar como respuesta directa
      parsed = {
        message: llmResponse.text,
        shouldEscalate: false,
        diagnosticSteps: [],
        confidence: 0.7
      };
    }

    response = {
      message: parsed.message || llmResponse.text,
      actions: parsed.actions || [],
      shouldEscalate: parsed.shouldEscalate || false,
      escalationReason: parsed.escalationReason,
      confidence: parsed.confidence || 0.7,
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil((parsed.message || llmResponse.text).length / 4)
      },
      diagnosticSteps: parsed.diagnosticSteps || []
    };
  } catch (error: any) {
    logger.error(`[SupportAgent] Error en LLM: ${error.message}`);

    // Fallback: usar respuesta RAG directamente
    response = {
      message: ragContext || "Estoy teniendo dificultades para procesar tu solicitud. ¿Te gustaría hablar con un agente humano?",
      actions: [],
      shouldEscalate: !ragContext,
      escalationReason: !ragContext ? 'Error en procesamiento + sin contexto RAG' : undefined,
      confidence: ragContext ? 0.5 : 0.1,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 },
      diagnosticSteps: ['Fallback activado por error en LLM']
    };
  }

  // 5. Registrar log
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'support',
      modelUsed: response.modelUsed,
      inputTokens: response.tokensUsed.input,
      outputTokens: response.tokensUsed.output,
      costUsd: 0,
      latencyMs: response.latencyMs,
      confidence: response.confidence,
      wasEscalated: response.shouldEscalate,
      escalationReason: response.escalationReason,
      inputSummary: input.substring(0, 200),
      outputSummary: response.message.substring(0, 200),
      metadata: {
        diagnosticSteps: response.diagnosticSteps.length,
        actionsCount: response.actions.length,
        ragSourcesUsed: ragSources.length
      }
    });
  } catch (logError: any) {
    logger.warn(`[SupportAgent] Error al registrar log: ${logError.message}`);
  }

  logger.info(
    `[SupportAgent] Respuesta: confidence=${response.confidence.toFixed(2)}, ` +
    `escalate=${response.shouldEscalate}, model=${modelKey}, ` +
    `latency=${response.latencyMs}ms`
  );

  return response;
};

/**
 * Construye el prompt de soporte
 */
function buildSupportPrompt(
  input: string,
  context: {
    ragContext: string;
    ticketHistory: Array<{ role: string; content: string }>;
    contactInfo: Record<string, unknown>;
  }
): string {
  const historyContext = context.ticketHistory.length > 0
    ? `\nHISTORIAL DEL TICKET:\n${context.ticketHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const contactContext = Object.keys(context.contactInfo).length > 0
    ? `\nINFO DEL CONTACTO:\n${JSON.stringify(context.contactInfo, null, 2)}`
    : '';

  const ragInfo = context.ragContext
    ? `\nINFORMACIÓN DE LA BASE DE CONOCIMIENTOS:\n${context.ragContext}`
    : '\n(No se encontró información relevante en la KB)';

  return `Eres un agente de soporte técnico experto para un CRM omnicanal.

Tu objetivo es diagnosticar y resolver el problema del usuario paso a paso.

REGLAS:
1. Sé empático y profesional
2. Diagnostica antes de ofrecer soluciones
3. Usa la información de la KB cuando sea relevante
4. Si no puedes resolver, sugiere escalación a humano
5. Responde en el mismo idioma del usuario
6. Sé conciso pero completo

Responde en JSON:
{
  "message": "tu respuesta al usuario",
  "shouldEscalate": false,
  "escalationReason": null,
  "diagnosticSteps": ["paso 1", "paso 2"],
  "confidence": 0.8,
  "actions": []
}
${historyContext}
${contactContext}
${ragInfo}

MENSAJE DEL USUARIO:
${input}`;
}

export default {
  processRequest
};
