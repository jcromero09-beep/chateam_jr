import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { selectModel } from "./ModelRouterService";
import AgentLogService from "./AgentLogService";
import logger from "../../utils/logger";

/**
 * Sales Agent -- Agente de ventas con pipeline CRM y calificacion BANT
 *
 * Responsabilidades:
 * 1. Calificar leads usando metodologia BANT (Budget, Authority, Need, Timeline)
 * 2. Recomendar productos/servicios relevantes
 * 3. Avanzar el pipeline de ventas
 * 4. Sugerir agendamiento de demos cuando el lead muestra alto interes
 */

export interface SalesResponse {
  message: string;
  leadScore: number; // 0-100
  leadQualification: {
    budget: boolean | null;
    authority: boolean | null;
    need: boolean | null;
    timeline: boolean | null;
  };
  suggestedActions: string[];
  products: Array<{ name: string; relevance: number }>;
  shouldScheduleMeeting: boolean;
  confidence: number;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

const processInquiry = async (
  message: string,
  companyId: number,
  options: {
    ticketId?: number;
    contactId?: number;
    ticketHistory?: string;
    contactInfo?: Record<string, any>;
  } = {}
): Promise<SalesResponse> => {
  const startTime = Date.now();
  const { ticketId, contactId, ticketHistory, contactInfo } = options;

  // 1. Select model (sales tier = mini)
  const modelSelection = await selectModel('sales', message, 'mini');
  const modelKey = modelSelection?.entity.key || 'gpt-5.5';

  // 2. Build sales prompt
  const prompt = buildSalesPrompt(message, ticketHistory, contactInfo);

  // 3. Cargar systemPrompt personalizado de BD (si existe)
  let dbSystemPrompt: string | undefined;
  try {
    const AIAgentConfig = require("../../models/AIAgentConfig").default;
    const agentConfig = await AIAgentConfig.findOne({ where: { slug: 'agente-ventas' } });
    if (agentConfig?.systemPrompt) {
      dbSystemPrompt = agentConfig.systemPrompt;
    }
  } catch (configErr: any) {
    logger.warn(`[SalesAgent] No se pudo cargar config de BD: ${configErr.message}`);
  }

  // 4. Call LLM
  let response: SalesResponse;
  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt,
      systemPrompt: dbSystemPrompt,
      modelKey,
      maxTokens: 1024,
      temperature: 0.4,
      responseFormat: 'json'
    });

    const parsed = JSON.parse(llmResponse.text);

    response = {
      message: parsed.message || "Gracias por tu interes. En que puedo ayudarte?",
      leadScore: parsed.leadScore || 50,
      leadQualification: {
        budget: parsed.leadQualification?.budget ?? null,
        authority: parsed.leadQualification?.authority ?? null,
        need: parsed.leadQualification?.need ?? null,
        timeline: parsed.leadQualification?.timeline ?? null
      },
      suggestedActions: parsed.suggestedActions || [],
      products: parsed.products || [],
      shouldScheduleMeeting: parsed.shouldScheduleMeeting || false,
      confidence: parsed.confidence || 0.7,
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil(llmResponse.text.length / 4)
      }
    };
  } catch (error: any) {
    logger.error(`[SalesAgent] Error en LLM: ${error.message}`);

    response = {
      message: "Gracias por tu interes. Permiteme conectarte con nuestro equipo de ventas para darte informacion mas detallada.",
      leadScore: 50,
      leadQualification: { budget: null, authority: null, need: null, timeline: null },
      suggestedActions: ["transfer_to_human"],
      products: [],
      shouldScheduleMeeting: false,
      confidence: 0.3,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }

  // 4. Log execution
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'sales',
      modelUsed: response.modelUsed,
      inputTokens: response.tokensUsed.input,
      outputTokens: response.tokensUsed.output,
      costUsd: calculateCost(response.tokensUsed, response.modelUsed),
      latencyMs: response.latencyMs,
      confidence: response.confidence,
      cacheHit: false,
      inputSummary: message.substring(0, 200),
      outputSummary: response.message.substring(0, 200),
      metadata: {
        leadScore: response.leadScore,
        shouldScheduleMeeting: response.shouldScheduleMeeting,
        productsCount: response.products.length
      }
    });
  } catch (logError: any) {
    logger.warn(`[SalesAgent] Error al registrar log: ${logError.message}`);
  }

  logger.info(
    `[SalesAgent] Respuesta: leadScore=${response.leadScore}, ` +
    `confidence=${response.confidence.toFixed(2)}, model=${response.modelUsed}, ` +
    `latency=${response.latencyMs}ms`
  );

  return response;
};

function buildSalesPrompt(
  message: string,
  ticketHistory?: string,
  contactInfo?: Record<string, any>
): string {
  let contextSection = "";

  if (contactInfo) {
    contextSection += `\nINFORMACION DEL CONTACTO:\n${JSON.stringify(contactInfo, null, 2)}\n`;
  }
  if (ticketHistory) {
    contextSection += `\nHISTORIAL DE CONVERSACION:\n${ticketHistory}\n`;
  }

  return `Eres un agente de ventas profesional para un CRM omnicanal.

OBJETIVO: Calificar al lead usando metodologia BANT (Budget, Authority, Need, Timeline),
recomendar productos/servicios relevantes, y avanzar el pipeline de ventas.

REGLAS:
1. Se amable y profesional, nunca agresivo
2. Haz preguntas BANT de forma natural en la conversacion
3. Si el lead muestra alto interes (score > 70), sugiere agendar una demo
4. Recomienda solo productos/servicios relevantes a la necesidad
5. Si detectas frustracion o queja, sugiere escalacion a soporte
6. Responde en el mismo idioma del usuario
7. SIEMPRE responde en JSON valido
${contextSection}

MENSAJE DEL USUARIO: "${message}"

Responde SOLO en JSON con este formato:
{
  "message": "Tu respuesta al usuario",
  "leadScore": 0-100,
  "leadQualification": {
    "budget": true/false/null,
    "authority": true/false/null,
    "need": true/false/null,
    "timeline": true/false/null
  },
  "suggestedActions": ["schedule_meeting", "send_quote", "transfer_to_human", "follow_up"],
  "products": [{"name": "Producto", "relevance": 0.0-1.0}],
  "shouldScheduleMeeting": true/false,
  "confidence": 0.0-1.0
}`;
}

function calculateCost(tokens: { input: number; output: number }, modelKey: string): number {
  const costs: Record<string, { input: number; output: number }> = {
    'gpt-5.5': { input: 0.005, output: 0.03 },
    'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
    'gpt-4.1': { input: 0.002, output: 0.008 },
    'claude-3.5-haiku': { input: 0.0008, output: 0.004 },
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 }
  };
  const modelCost = costs[modelKey] || { input: 0.001, output: 0.003 };
  return (tokens.input / 1000) * modelCost.input + (tokens.output / 1000) * modelCost.output;
}

export default { processInquiry };
