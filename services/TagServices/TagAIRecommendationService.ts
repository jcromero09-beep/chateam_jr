/**
 * TagAIRecommendationService
 *
 * Genera recomendaciones de configuración de seguimientos para etiquetas Kanban.
 * Usa el proveedor de IA configurado (OpenAI / Anthropic / Google) para analizar
 * el nombre y descripción de la etiqueta y recomendar:
 *
 * 1. Intervalos de envío óptimos (followupDelay1/2/3 en horas)
 * 2. Prompts de contexto IA para cada mensaje (aiGuidance1/2/3)
 *    -> NO son los mensajes que se envían al cliente, son "hints" para que
 *       el agente IA tenga más contexto sobre qué decir o cómo actuar.
 *
 * Ejemplo de uso:
 *   const rec = await TagAIRecommendationService({ name: "Leads Calientes", description: "..." });
 *   // rec.followupDelay1 = 1, rec.followupDelay2 = 4, rec.aiGuidance1 = "El lead mostró interés en..."
 */

import { chatCompletion } from "../AIClientService";

export interface AIRecommendation {
  followupDelay1: number;
  followupDelay2: number;
  followupDelay3: number;
  aiGuidance1: string;
  aiGuidance2: string;
  aiGuidance3: string;
  reasoning: string;
}

export interface TagAIRecommendationOptions {
  name: string;
  description?: string;
  companyId?: number;
}

const SYSTEM_PROMPT = `Eres un asistente experto en CRM y estrategia de seguimiento de clientes (lead nurturing).

Tu tarea es analizar UNA etiqueta/etapa de un pipeline Kanban y recomendar:
1. **Intervalos óptimos de envío** (en horas) para 1-3 mensajes de seguimiento automático.
2. **Prompts de contexto IA** para cada mensaje. IMPORTANTE: estos NO son los mensajes que se envían al cliente. Son "hints" o guías de contexto que alimentan al AGENTE IA cuando responde al cliente en esta etapa. Ayudan al agente a saber con qué actitud, qué información de referencia, y qué tono usar.

REGLAS PARA INTERVALOS:
- Etapas tempranas (Lead Nuevo, Contacto Inicial): intervalos cortos (1-4h)
- Etapas de calificación: 4-12h
- Etapas avanzadas (Negociación, Cerrado): intervalos más largos (12-48h)
- NUNCA sugeriras intervalos menores a 1 hora

REGLAS PARA AI GUIDANCE:
- Máximo 200 caracteres cada uno
- Deben ser consejos actionable para el AGENTE IA, no para el cliente
- Incluir: tono a usar, información clave del contexto, errores a evitar
- Si la etapa no requiere seguimiento,guidance puede estar vacío ""

Responde ESTRICTAMENTE en JSON válido con esta estructura exacta:
{
  "followupDelay1": número_en_horas,
  "followupDelay2": número_en_horas,
  "followupDelay3": número_en_horas,
  "aiGuidance1": "prompt de contexto para el agente IA antes del mensaje 1 (max 200 chars, puede estar vacío)",
  "aiGuidance2": "prompt de contexto para el agente IA antes del mensaje 2 (max 200 chars, puede estar vacío)",
  "aiGuidance3": "prompt de contexto para el agente IA antes del mensaje 3 (max 200 chars, puede estar vacío)",
  "reasoning": "breve explicación de por qué se recomiendan estos intervalos y guidance (máx 150 chars)"
}

NO agregues markdown, ni triples backticks, ni explicaciones fuera del JSON.`;

export async function TagAIRecommendationService(
  options: TagAIRecommendationOptions
): Promise<AIRecommendation> {
  const { name, description } = options;

  const userPrompt = description && description.trim().length > 0
    ? `Nombre de la etapa: "${name}"
Descripción de la etapa: "${description}"

Basándote en esta información, recomienda intervalos y guidance de contexto IA.`
    : `Nombre de la etapa: "${name}"

No hay descripción disponible. Infiere el propósito de esta etapa por su nombre y recomienda intervalos y guidance de contexto IA.`;

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 800,
      temperature: 0.4,
      companyId: options.companyId,
      module: "chat"
    });

    const raw = response.content.trim();

    // Intentar parsear como JSON (ignorar markdown code blocks si los hay)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Respuesta IA no contiene JSON válido: ${raw.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AIRecommendation>;

    // Validación y defaults
    const recommendation: AIRecommendation = {
      followupDelay1: clampDelay(parsed.followupDelay1 ?? 2),
      followupDelay2: clampDelay(parsed.followupDelay2 ?? 6),
      followupDelay3: clampDelay(parsed.followupDelay3 ?? 12),
      aiGuidance1: truncate((parsed.aiGuidance1 ?? ""), 200),
      aiGuidance2: truncate((parsed.aiGuidance2 ?? ""), 200),
      aiGuidance3: truncate((parsed.aiGuidance3 ?? ""), 200),
      reasoning: truncate((parsed.reasoning ?? ""), 150),
    };

    return recommendation;
  } catch (err: any) {
    console.error("[TagAIRecommendationService] Error:", err.message);
    // Fallback inteligente si falla la IA
    return getFallbackRecommendation(name);
  }
}

/** Fuerza delays mínimos de 1 hora y máximos de 168 (7 días) */
function clampDelay(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 4;
  return Math.max(1, Math.min(168, Math.round(num)));
}

/** Trunca texto a máximo N caracteres */
function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.trim().slice(0, max);
}

/** Fallback cuando la IA falla — deduce intervalos por keywords del nombre */
function getFallbackRecommendation(name: string): AIRecommendation {
  const lower = name.toLowerCase();

  if (lower.includes("nuevo") || lower.includes("lead") || lower.includes("contacto")) {
    return {
      followupDelay1: 1,
      followupDelay2: 4,
      followupDelay3: 8,
      aiGuidance1: "El lead es nuevo. Sé amable y enthsiasta. Pregunta qué necesita.",
      aiGuidance2: "Lead sin respuesta. Ofrece ayuda concreta y resuelve dudas.",
      aiGuidance3: "Último intento. Envía una oferta o beneficio exclusivo.",
      reasoning: "Etapa temprana de lead: intervalos cortos para responder rápido."
    };
  }

  if (lower.includes("negoci") || lower.includes("cerrado") || lower.includes("pago")) {
    return {
      followupDelay1: 2,
      followupDelay2: 12,
      followupDelay3: 48,
      aiGuidance1: "Etapa de cierre. Sé profesional y resuelve objeciones finales.",
      aiGuidance2: "Revisa si hay dudas pendientes. Ofrece garantías.",
      aiGuidance3: "Follow-up final. Confirma si necesita algo más para decidirse.",
      reasoning: "Etapa avanzada: intervalos moderados para no presionar."
    };
  }

  if (lower.includes("seguimien") || lower.includes("espera") || lower.includes("standby")) {
    return {
      followupDelay1: 24,
      followupDelay2: 72,
      followupDelay3: 168,
      aiGuidance1: "Cliente en espera. Envía un check-in breve y amigable.",
      aiGuidance2: "Cliente sin respuesta. Ofrece una alternativa o nueva propuesta.",
      aiGuidance3: "Último mensaje. Pregunta si sigue interesado o cierra el ticket.",
      reasoning: "Etapa de seguimiento: intervalos largos para no saturar."
    };
  }

  // Default genérico
  return {
    followupDelay1: 4,
    followupDelay2: 12,
    followupDelay3: 48,
    aiGuidance1: "Verifica que el cliente esté satisfecho con el avance en esta etapa.",
    aiGuidance2: "Resuelve cualquier duda o bloqueo que pueda tener el cliente.",
    aiGuidance3: "Prepara al cliente para la siguiente etapa del proceso.",
    reasoning: "Configuración genérica recomendada para etapa de pipeline."
  };
}

export default TagAIRecommendationService;
