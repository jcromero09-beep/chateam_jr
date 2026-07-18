import { chatCompletion } from "../../AIClientService";
import { QueueClassificationResult } from "./types";

// Funcion para clasificar y asignar queue basado en la conversacion
// MIGRADO: Ya no recibe openai como parametro, usa AIClientService
export const classifyAndAssignQueue = async (
  conversationHistory: string,
  availableQueues: Array<{ id: number; name: string; promptAI: string | null }>,
  companyId: number
): Promise<QueueClassificationResult> => {
  if (!availableQueues || availableQueues.length === 0) {
    return {
      shouldAssignQueue: false,
      queueId: null,
      queueName: null,
      confidence: 0,
      reason: "No hay queues disponibles"
    };
  }

  const queuesDescription = availableQueues
    .map(q => `- ID: ${q.id}, Nombre: "${q.name}"${q.promptAI ? `, Descripción: ${q.promptAI.substring(0, 100)}...` : ""}`)
    .join("\n");

  const classificationPrompt = `Analiza la siguiente conversación y determina si el cliente necesita ser asignado a un departamento específico.

DEPARTAMENTOS DISPONIBLES:
${queuesDescription}

CONVERSACIÓN:
${conversationHistory}

INSTRUCCIONES:
1. Analiza el contexto de la conversación
2. Identifica si el cliente ha expresado necesidad de un departamento específico (soporte técnico, ventas, facturación, etc.)
3. Solo asigna un departamento si el cliente lo ha solicitado explícitamente o si el contexto lo indica claramente

Responde ÚNICAMENTE en formato JSON:
{
  "shouldAssign": true/false,
  "queueId": número o null,
  "queueName": "nombre" o null,
  "confidence": 0.0 a 1.0,
  "reason": "explicación breve"
}`;

  try {
    // MIGRADO: Usar chatCompletion de AIClientService
    const response = await chatCompletion({
      messages: [{ role: "system", content: classificationPrompt }],
      maxTokens: 200,
      temperature: 0.3,
      companyId,
      module: 'classification'
    });

    const content = response.content || "";

    // Extraer JSON de la respuesta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        shouldAssignQueue: parsed.shouldAssign === true,
        queueId: parsed.queueId || null,
        queueName: parsed.queueName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || ""
      };
    }
  } catch (error) {
    console.error("Error en clasificación de queue:", error);
  }

  return {
    shouldAssignQueue: false,
    queueId: null,
    queueName: null,
    confidence: 0,
    reason: "Error en clasificación"
  };
};
