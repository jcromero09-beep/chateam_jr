import ToolRegistry, { ToolContext, ToolResult } from "./ToolRegistry";
import logger from "../../utils/logger";

/**
 * ToolExecutor — Ejecuta herramientas del ToolRegistry con guardrails
 *
 * Responsabilidades:
 * 1. Recibir tool_calls del LLM
 * 2. Validar permisos del agente
 * 3. Ejecutar la herramienta real (BookingService, AvailabilityService, etc.)
 * 4. Retornar el resultado para que el LLM genere la respuesta final
 * 5. Manejar errores sin romper el flujo
 */

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  executionTimeMs: number;
}

/**
 * Ejecuta una lista de tool_calls del LLM
 */
async function executeToolCalls(
  toolCalls: ToolCall[],
  context: ToolContext,
  agentType: string
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];

  for (const toolCall of toolCalls) {
    const startTime = Date.now();
    const toolName = toolCall.function.name;

    logger.info(
      `[ToolExecutor] Ejecutando tool: ${toolName} | agente: ${agentType} | ` +
      `empresa: ${context.companyId} | ticket: ${context.ticketId}`
    );

    // 1. Buscar la herramienta en el registro
    const tool = ToolRegistry.getTool(toolName);
    if (!tool) {
      logger.warn(`[ToolExecutor] Herramienta no encontrada: ${toolName}`);
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: {
          success: false,
          data: null,
          message: `Herramienta '${toolName}' no disponible. Usa solo las herramientas listadas.`
        },
        executionTimeMs: Date.now() - startTime
      });
      continue;
    }

    // 2. Verificar permisos del agente
    if (!tool.allowedAgents.includes('all') && !tool.allowedAgents.includes(agentType)) {
      logger.warn(
        `[ToolExecutor] Agente '${agentType}' no tiene permiso para '${toolName}'. ` +
        `Permitidos: ${tool.allowedAgents.join(', ')}`
      );
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: {
          success: false,
          data: null,
          message: `No tienes permiso para usar '${toolName}'. Responde sin usar esta herramienta.`
        },
        executionTimeMs: Date.now() - startTime
      });
      continue;
    }

    // 3. Parsear argumentos
    let args: Record<string, any>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      logger.error(`[ToolExecutor] Error parseando args de ${toolName}: ${toolCall.function.arguments}`);
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: {
          success: false,
          data: null,
          message: 'Error en los parámetros. Verifica el formato de los argumentos.'
        },
        executionTimeMs: Date.now() - startTime
      });
      continue;
    }

    // 4. Ejecutar la herramienta con timeout de 15 segundos
    try {
      const timeoutPromise = new Promise<ToolResult>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: la herramienta tardó más de 15 segundos')), 15000);
      });

      const result = await Promise.race([
        tool.handler(args, context),
        timeoutPromise
      ]);

      logger.info(
        `[ToolExecutor] ✅ ${toolName} completado: success=${result.success}, ` +
        `latency=${Date.now() - startTime}ms`
      );

      results.push({
        toolCallId: toolCall.id,
        toolName,
        result,
        executionTimeMs: Date.now() - startTime
      });
    } catch (execError: any) {
      logger.error(`[ToolExecutor] ❌ Error ejecutando ${toolName}: ${execError.message}`);
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: {
          success: false,
          data: null,
          message: `Error al ejecutar ${toolName}: ${execError.message}`
        },
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  return results;
}

/**
 * Convierte resultados de herramientas al formato de mensajes para OpenAI
 */
function toolResultsToMessages(
  results: ToolExecutionResult[]
): Array<{ role: 'tool'; tool_call_id: string; content: string }> {
  return results.map(r => ({
    role: 'tool' as const,
    tool_call_id: r.toolCallId,
    content: JSON.stringify({
      success: r.result.success,
      data: r.result.data,
      message: r.result.message
    })
  }));
}

export default {
  executeToolCalls,
  toolResultsToMessages
};
