import { generateText } from "../AIClientService";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[QuickReplyRedraft]";

export interface QuickReplyRedraftInput {
  companyId: number;
  shortcode?: string;
  message?: string;
}

export interface QuickReplyRedraftResult {
  message: string;
}

const buildPrompt = (input: QuickReplyRedraftInput): string => `
Eres un redactor experto de mensajes de atención al cliente por WhatsApp.
Reescribe y mejora el siguiente mensaje de respuesta rápida para que sea claro,
profesional, cálido y fácil de leer, agregando emojis descriptivos y apropiados
(con moderación, relevantes al contenido). Mantén el idioma original y el
significado; NO inventes datos (precios, direcciones, horarios, nombres) que no
estén en el texto original.

Atajo (contexto/tema): ${input.shortcode || "(sin atajo)"}
Mensaje original:
"""
${input.message || ""}
"""

Reglas:
- Devuelve SOLO el mensaje reescrito, sin comillas ni explicaciones adicionales.
- Conserva intactas las variables entre llaves si existen (por ejemplo {{nombre}}).
- Usa saltos de línea si mejoran la legibilidad.
- No agregues información que el usuario no haya escrito.
`;

// Quita comillas/backticks envolventes que a veces agrega el modelo
const stripWrappingQuotes = (text: string): string =>
  text.replace(/^\s*["'`]+/, "").replace(/["'`]+\s*$/, "").trim();

const redraft = async (
  input: QuickReplyRedraftInput
): Promise<QuickReplyRedraftResult> => {
  const original = (input.message || "").trim();
  if (!original) {
    return { message: original };
  }

  try {
    const result = await generateText({
      prompt: buildPrompt(input),
      temperature: 0.6,
      maxTokens: 600,
      companyId: input.companyId,
      modelKey: "gpt-5.5"
    });

    const cleaned = stripWrappingQuotes(result.text || "");
    return { message: cleaned || original };
  } catch (error: any) {
    logger.warn(
      `${SERVICE_PREFIX} Redacción IA falló, devuelvo el original: ${error?.message || error}`
    );
    return { message: original };
  }
};

export default {
  redraft
};
