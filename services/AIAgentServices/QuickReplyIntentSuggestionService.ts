import { analyzeImage, generateText, isCapabilityAvailable } from "../AIClientService";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[QuickReplyIntentSuggestion]";

export interface QuickReplyIntentSuggestionInput {
  companyId: number;
  shortcode?: string;
  message?: string;
  mediaName?: string;
  mediaUrl?: string;
  mediaDataUrl?: string;
}

export interface QuickReplyIntentSuggestion {
  intentKey: string;
  intent: string;
  confidence: number;
  reason: string;
  imageSummary?: string;
}

const COMMON_KEYS = [
  "location_question",
  "plan_selection",
  "pricing_question",
  "feature_check",
  "appointment_request",
  "schedule_question",
  "payment_question",
  "installation_question",
  "support_question",
  "warranty_question",
  "promotion_question",
  "document_request",
  "demo_video",
  "greeting",
  "farewell",
  "general_info"
];

const normalize = (value?: string): string => {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const slugKey = (value: string): string => {
  return normalize(value)
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
};

const truncate = (value: string, max: number): string => {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trim() : clean;
};

const parseJsonObject = (text: string): Record<string, any> | null => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const heuristicSuggestion = (input: QuickReplyIntentSuggestionInput): QuickReplyIntentSuggestion => {
  const joined = normalize([
    input.shortcode,
    input.message,
    input.mediaName
  ].filter(Boolean).join(" "));

  let intentKey = "general_info";
  if (/(ubicacion|ubicados|direccion|local|mapa|maps|sucursal|oficina|donde)/.test(joined)) {
    intentKey = "location_question";
  } else if (/(gold|silver|basic|premium|plan|planes|paquete)/.test(joined)) {
    intentKey = "plan_selection";
  } else if (/(precio|costo|cuanto|valor|mensualidad|pago)/.test(joined)) {
    intentKey = "pricing_question";
  } else if (/(geozona|alerta|funcion|incluye|caracteristica)/.test(joined)) {
    intentKey = "feature_check";
  } else if (/(cita|agenda|agendar|instalacion|instalar)/.test(joined)) {
    intentKey = "appointment_request";
  } else if (/(horario|atienden|abierto)/.test(joined)) {
    intentKey = "schedule_question";
  } else if (/(garantia|soporte|ayuda|problema)/.test(joined)) {
    intentKey = "support_question";
  }

  const topic = input.shortcode || input.message || input.mediaName || intentKey;
  return {
    intentKey,
    intent: truncate(`Usar cuando el cliente pregunte o confirme sobre ${topic}.`, 100),
    confidence: 0.45,
    reason: "heuristic_fallback"
  };
};

const maybeAnalyzeImage = async (input: QuickReplyIntentSuggestionInput): Promise<string> => {
  const imageSource = input.mediaDataUrl || input.mediaUrl || "";
  const mediaName = input.mediaName || "";
  const looksLikeImage =
    imageSource.startsWith("data:image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(mediaName) ||
    /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(imageSource);

  if (!imageSource || !looksLikeImage) return "";

  try {
    const available = await isCapabilityAvailable("imageAnalysis");
    if (!available) return "";

    const result = await analyzeImage(
      imageSource,
      [
        "Describe brevemente esta imagen para clasificar una respuesta rapida de WhatsApp.",
        "Identifica si muestra planes, ubicacion, precios, pasos, promocion, soporte, producto o agenda.",
        "No inventes datos no visibles. Maximo 60 palabras."
      ].join(" "),
      { companyId: input.companyId, maxTokens: 120 }
    );
    return truncate(result.content || "", 500);
  } catch (error: any) {
    logger.warn(`${SERVICE_PREFIX} Vision falló, sigo con texto/mediaName: ${error?.message || error}`);
    return "";
  }
};

const suggest = async (
  input: QuickReplyIntentSuggestionInput
): Promise<QuickReplyIntentSuggestion> => {
  const fallback = heuristicSuggestion(input);
  const imageSummary = await maybeAnalyzeImage(input);

  const prompt = `
Analiza esta respuesta rapida de WhatsApp y genera una key estable para que una IA la encuentre cuando corresponda.

Campos:
- shortcode: ${input.shortcode || "(vacio)"}
- message: ${input.message || "(vacio)"}
- mediaName: ${input.mediaName || "(sin archivo)"}
- imageSummary: ${imageSummary || "(sin analisis visual)"}

Keys comunes permitidas:
${COMMON_KEYS.join(", ")}

Reglas:
- Si una key comun encaja, usala exactamente.
- Si el contenido es de un plan especifico, puedes usar plan_<nombre>_selection, por ejemplo plan_gold_selection.
- Si es ubicacion/direccion/mapa/local, usa location_question.
- Si es precio/costo/promocion, usa pricing_question o promotion_question.
- Si es una caracteristica concreta, usa feature_check.
- La descripcion "intent" debe explicar cuando usarla y mencionar sinonimos utiles del cliente.
- No uses mas de 80 caracteres en intentKey ni mas de 100 en intent.
- Responde solo JSON.

JSON esperado:
{
  "intentKey": "location_question",
  "intent": "Usar cuando el cliente pregunte donde estan ubicados, direccion, local o mapa.",
  "confidence": 0.0,
  "reason": "..."
}
`;

  try {
    const result = await generateText({
      prompt,
      responseFormat: "json",
      temperature: 0.1,
      maxTokens: 220,
      companyId: input.companyId,
      modelKey: "gpt-5.5"
    });
    const parsed = parseJsonObject(result.text);
    if (!parsed) return { ...fallback, imageSummary };

    const rawKey = String(parsed.intentKey || fallback.intentKey);
    const intentKey = slugKey(rawKey) || fallback.intentKey;
    const intent = truncate(String(parsed.intent || fallback.intent), 100) || fallback.intent;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? fallback.confidence)));
    const reason = truncate(String(parsed.reason || "ai_generated"), 200);

    return {
      intentKey,
      intent,
      confidence,
      reason,
      imageSummary: imageSummary || undefined
    };
  } catch (error: any) {
    logger.warn(`${SERVICE_PREFIX} Generacion IA falló, usando fallback: ${error?.message || error}`);
    return { ...fallback, imageSummary: imageSummary || undefined };
  }
};

export default {
  suggest
};
