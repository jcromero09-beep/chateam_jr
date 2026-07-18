import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { selectModel } from "./ModelRouterService";
import logger from "../../utils/logger";

/**
 * AppointmentResponseClassifier
 *
 * Clasifica semánticamente la respuesta de un cliente a un mensaje de
 * confirmación de cita. Reemplaza el enfoque basado en regex (frágil)
 * por una clasificación LLM que entiende:
 *  - Afirmaciones naturales: "dale", "va", "ahí estaré", "perfecto"
 *  - Emojis: 👍 ✅ 🙏 👌 🆗
 *  - Reagendamientos implícitos: "no puedo ese día", "mejor el viernes"
 *  - Cancelaciones indirectas: "ya no me interesa", "mejor no"
 *  - Preguntas ambiguas: "¿a qué hora era?" → ambiguous
 *
 * Cuando devuelve intent='ambiguous' con baja confianza, el caller
 * debe pasar el mensaje al flujo normal (Sales/Support con tools),
 * NO asumir confirmación ni negación.
 *
 * Modelo: gpt-5.5 por defecto (respetando ModelRouterService si hay config).
 */

export type AppointmentIntent = 'confirm' | 'reschedule' | 'cancel' | 'ambiguous';

export interface AppointmentClassification {
  intent: AppointmentIntent;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

export interface ClassificationContext {
  appointmentTitle?: string;      // Ej: "Instalación GPS"
  appointmentStartTime?: Date;    // Fecha/hora de la cita
  previousAiMessage?: string;     // Último mensaje enviado por la IA al cliente
  companyId?: number;             // Requerido para selectModel (config por empresa)
}

/**
 * Clasifica la respuesta del cliente.
 *
 * @param message Texto (o emoji) del cliente
 * @param context Contexto de la cita pendiente
 */
const classifyResponse = async (
  message: string,
  context: ClassificationContext = {}
): Promise<AppointmentClassification> => {
  const startTime = Date.now();

  // 🆕 Usar selectModel para respetar la config de modelo por empresa
  const modelSelection = await selectModel('appointment_classifier', message, 'mini');
  const modelKey = modelSelection?.entity.key || 'gpt-5.5';

  // Construir descripción de la cita para dar contexto al LLM
  let citaInfo = '';
  if (context.appointmentTitle || context.appointmentStartTime) {
    citaInfo += '\nCITA PENDIENTE DE CONFIRMAR:';
    if (context.appointmentTitle) citaInfo += `\n- Tipo: ${context.appointmentTitle}`;
    if (context.appointmentStartTime) {
      const fecha = new Date(context.appointmentStartTime).toLocaleString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit'
      });
      citaInfo += `\n- Fecha: ${fecha}`;
    }
  }

  let previoIa = '';
  if (context.previousAiMessage) {
    previoIa = `\n\nÚLTIMO MENSAJE DE LA IA AL CLIENTE:\n"${context.previousAiMessage.substring(0, 300)}"`;
  }

  const prompt = `Eres un clasificador experto en respuestas de clientes sobre citas.
${citaInfo}${previoIa}

RESPUESTA DEL CLIENTE: "${message}"

Clasifica la intención del cliente en UNA de estas categorías:

- "confirm": El cliente confirma que asistirá. Incluye:
    * Afirmaciones directas: "sí", "si", "confirmo", "confirmado", "claro"
    * Expresiones coloquiales: "dale", "va", "ok", "perfecto", "listo"
    * Compromisos: "ahí estaré", "nos vemos", "ahí voy", "cuenta conmigo"
    * Emojis positivos: 👍 ✅ 🙏 👌 🆗 ☺️ 👏
    * Mensajes largos que expresan aceptación clara

- "reschedule": El cliente quiere cambiar la fecha/hora. Incluye:
    * "no puedo ese día", "no me queda", "tengo otra cosa"
    * "¿podemos moverla?", "mejor el viernes", "cámbiala"
    * Propuesta de otra fecha/hora sin cancelar intención

- "cancel": El cliente cancela definitivamente sin querer reagendar:
    * "cancela", "ya no me interesa", "no voy"
    * "mejor no", "olvídalo", "no quiero"

- "ambiguous": NO queda claro o el mensaje no responde a la confirmación:
    * Preguntas sobre la cita: "¿a qué hora era?", "¿dónde es?"
    * Otras dudas u otro tema
    * Dudas genuinas: "uhmm déjame ver", "no estoy seguro"
    * Saludos o mensajes cortos no interpretables

REGLAS CRÍTICAS:
1. Si hay cualquier duda entre confirm/cancel/reschedule, usa "ambiguous" con confidence baja.
2. Emojis solos son clasificables (pulgar arriba = confirm, cara triste = cancel probable).
3. "No" solo, sin más contexto, es ambiguous (puede ser "no puedo ese día" o "no cancela").
4. Un mensaje con pregunta es ambiguous aunque contenga "sí" (ej: "sí, ¿pero a qué hora?").

Responde ÚNICAMENTE con JSON válido:
{
  "intent": "confirm" | "reschedule" | "cancel" | "ambiguous",
  "confidence": número entre 0.0 y 1.0,
  "reasoning": "explicación breve en una línea"
}`;

  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: 120,
      temperature: 0.1, // Muy determinista
      responseFormat: 'json',
      companyId: context.companyId
    });

    const parsed = JSON.parse(llmResponse.text);

    // Validar intent
    const validIntents: AppointmentIntent[] = ['confirm', 'reschedule', 'cancel', 'ambiguous'];
    const intent: AppointmentIntent = validIntents.includes(parsed.intent)
      ? parsed.intent
      : 'ambiguous';

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    const classification: AppointmentClassification = {
      intent,
      confidence,
      reasoning: parsed.reasoning || 'Sin razonamiento',
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil(llmResponse.text.length / 4)
      }
    };

    logger.info(
      `[AppointmentResponseClassifier] intent=${intent}, ` +
      `confidence=${confidence.toFixed(2)}, msg="${message.substring(0, 40)}...", ` +
      `latency=${classification.latencyMs}ms`
    );

    return classification;
  } catch (error: any) {
    logger.error(
      `[AppointmentResponseClassifier] Error clasificando mensaje: ${error.message}. ` +
      `Retornando 'ambiguous' como fallback seguro.`
    );

    // Fallback SEGURO: ambiguous con baja confidence → flujo normal decide
    return {
      intent: 'ambiguous',
      confidence: 0.3,
      reasoning: `Fallback por error: ${error.message}`,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }
};

export default { classifyResponse };
