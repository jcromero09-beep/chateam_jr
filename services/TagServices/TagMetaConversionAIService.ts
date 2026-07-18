/**
 * TagMetaConversionAIService
 *
 * Sugiere la configuración de una "conversión personalizada Meta" para una
 * etiqueta Kanban a partir de su nombre/descripción/key. SOLO rellena campos
 * sugeridos — NO guarda nada ni llama a Meta. El usuario revisa y guarda.
 *
 * Cobra créditos igual que TagAIRecommendationService (classification → message).
 * Si no hay créditos o la IA falla, devuelve un fallback determinístico.
 */

import { chatCompletion } from "../AIClientService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { chargeClassification } from "../AICreditServices/AIUsagePricingService";

export interface MetaConversionRecommendation {
  metaConversionName: string;
  metaEventName: string;
  metaLeadStatus: string;
  metaCustomEventType: string;
  /** Regla JSON (string) lista para el campo Rule. */
  metaRule: string;
  reasoning: string;
}

export interface TagMetaConversionAIOptions {
  name: string;
  description?: string;
  key?: string;
  companyId?: number;
}

const VALID_CUSTOM_EVENT_TYPES = [
  "ADD_PAYMENT_INFO", "ADD_TO_CART", "ADD_TO_WISHLIST", "COMPLETE_REGISTRATION",
  "CONTACT", "CUSTOMIZE_PRODUCT", "DONATE", "FIND_LOCATION", "INITIATE_CHECKOUT",
  "LEAD", "PURCHASE", "SCHEDULE", "SEARCH", "START_TRIAL", "SUBMIT_APPLICATION",
  "SUBSCRIBE", "VIEW_CONTENT", "OTHER"
];

const SYSTEM_PROMPT = `Eres un experto en Meta Conversions API (CAPI) y custom conversions para campañas de mensajería (WhatsApp/CTWA).

Tu tarea: a partir de UNA etapa de pipeline Kanban, sugerir la configuración de una conversión personalizada de Meta que se enviará cuando un ticket entra en esa etapa.

Debes proponer:
1. metaConversionName: nombre claro y corto para la conversión (máx 60 chars).
2. metaEventName: nombre del evento base CAPI. Para etapas de lead/interes en WhatsApp usa LeadSubmitted; Meta lo registra en custom conversions como Lead. Usa otros nombres estándar cuando aplique (Schedule, Purchase, CompleteRegistration, StartTrial, Subscribe, SubmitApplication) o un nombre propio en PascalCase si la etapa es específica.
3. metaLeadStatus: identificador corto en snake_case que describa el estado del lead en esta etapa (ej: "interest", "qualified", "hot_lead", "won", "lost").
4. metaCustomEventType: UNO de esta lista EXACTA: ${VALID_CUSTOM_EVENT_TYPES.join(", ")}. Si no hay match claro usa "OTHER".
5. metaRule: una regla JSON que Meta evalúa para CONTAR la conversión. Debe combinar el evento y el lead_status. Formato:
   {"and":[{"event":{"eq":"<evento_para_custom_conversion>"}},{"lead_status":{"eq":"<metaLeadStatus>"}}]}
   Operadores válidos: eq, neq, contains, i_contains, gt, gte, lt, lte, regex_match.

REGLAS:
- Si metaEventName es LeadSubmitted, dentro de la rule usa event eq Lead, porque Meta agrega LeadSubmitted como Lead en custom conversions.
- Para otros eventos, el event usado dentro de la rule DEBE coincidir EXACTAMENTE con el metaEventName propuesto.
- metaLeadStatus usado dentro de la rule DEBE coincidir EXACTAMENTE con el metaLeadStatus propuesto.
- No inventes operadores fuera de la lista.

Responde ESTRICTAMENTE en JSON válido con esta estructura exacta, SIN markdown ni backticks:
{
  "metaConversionName": "...",
  "metaEventName": "...",
  "metaLeadStatus": "...",
  "metaCustomEventType": "...",
  "metaRule": "{\\"and\\":[{\\"event\\":{\\"eq\\":\\"...\\"}},{\\"lead_status\\":{\\"eq\\":\\"...\\"}}]}",
  "reasoning": "breve explicación (máx 150 chars)"
}`;

const truncate = (text: string, max: number): string =>
  (text || "").toString().trim().slice(0, max);

const sanitizeEventType = (value?: string): string => {
  const upper = (value || "").toUpperCase().trim();
  return VALID_CUSTOM_EVENT_TYPES.includes(upper) ? upper : "OTHER";
};

const sanitizeLeadStatus = (value?: string, fallback = "interest"): string => {
  const slug = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
};

const getCustomConversionRuleEventName = (eventName: string): string =>
  eventName === "LeadSubmitted" ? "Lead" : eventName;

const buildRule = (eventName: string, leadStatus: string): string =>
  JSON.stringify({
    and: [
      { event: { eq: getCustomConversionRuleEventName(eventName) } },
      { lead_status: { eq: leadStatus } }
    ]
  });

/** Fallback determinístico por keywords del nombre (sin IA ni créditos). */
export function getFallbackMetaRecommendation(
  name: string,
  key?: string
): MetaConversionRecommendation {
  // Normaliza tildes: 'Interés' → 'interes' para que matchee la rama /interes/ (y no caiga al default).
  const lower = `${name} ${key || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // combining diacritics (post-NFD)

  // Default (etapa sin keyword reconocida) queda en LeadSubmitted; solo el tier de entrada/interés
  // pasa a Contact (decisión JC 2026-07-18, cambio quirúrgico — ver la rama /interes/ abajo).
  let eventName = "LeadSubmitted";
  let leadStatus = "interest";
  let eventType = "LEAD";

  if (/(venta|compra|pago|won|ganad|cerrad|purchase)/.test(lower)) {
    eventName = "Purchase";
    leadStatus = "won";
    eventType = "PURCHASE";
  } else if (/(caliente|hot|negoci|propuesta|cotiz|qualified|calific)/.test(lower)) {
    eventName = "Lead";
    leadStatus = "qualified";
    eventType = "LEAD";
  } else if (/(cita|agenda|schedule|reserva|appointment)/.test(lower)) {
    eventName = "Schedule";
    leadStatus = "scheduled";
    eventType = "SCHEDULE";
  } else if (/(registro|signup|alta|registration)/.test(lower)) {
    eventName = "CompleteRegistration";
    leadStatus = "registered";
    eventType = "COMPLETE_REGISTRATION";
  } else if (/(interes|atrac|nuevo|lead|contacto)/.test(lower)) {
    // Decisión JC (2026-07-18): tier de ENTRADA/interés → Meta `Contact` (antes "LeadSubmitted").
    // Embudo escalonado: Contact(interés) → Lead(calificado) → Schedule → CompleteRegistration → Purchase.
    eventName = "Contact";
    leadStatus = "interest";
    eventType = "LEAD";
  }

  return {
    metaConversionName: truncate(`Kanban ${name}`, 60),
    metaEventName: eventName,
    metaLeadStatus: leadStatus,
    metaCustomEventType: eventType,
    metaRule: buildRule(eventName, leadStatus),
    reasoning: "Sugerencia determinística por el nombre de la etapa."
  };
}

export async function TagMetaConversionAIService(
  options: TagMetaConversionAIOptions
): Promise<MetaConversionRecommendation> {
  const { name, description, key } = options;

  const userPrompt = `Etapa Kanban:
- Nombre: "${name}"
- key: "${key || "(autogenerado)"}"
- Descripción: "${description?.trim() || "(sin descripción)"}"

Sugiere la configuración de conversión personalizada Meta para esta etapa.`;

  // 💳 Cobro unificado (classification → message). Sin company = uso interno.
  if (options.companyId) {
    try {
      await chargeClassification({
        companyId: options.companyId,
        units: 1,
        source: "tag_meta_conversion_ai",
        sourceId: options.name,
        description: `Sugerencia IA conversión Meta tag="${options.name}"`,
        metadata: { hasDescription: !!options.description }
      });
    } catch (creditErr: any) {
      const isInsufficient =
        creditErr instanceof AppError &&
        (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
          creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
      if (isInsufficient) {
        logger.warn(
          `[TagMetaConversionAI] Sin créditos (company=${options.companyId}); usando fallback`
        );
      } else {
        logger.warn(
          `[TagMetaConversionAI] Error cobro: ${creditErr?.message || creditErr}; usando fallback`
        );
      }
      return getFallbackMetaRecommendation(name, key);
    }
  }

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 600,
      temperature: 0.3,
      companyId: options.companyId,
      module: "chat"
    });

    const raw = response.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Respuesta IA sin JSON válido: ${raw.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<MetaConversionRecommendation>;

    const eventName = truncate(parsed.metaEventName || "Contact", 60) || "Contact";
    const leadStatus = sanitizeLeadStatus(parsed.metaLeadStatus);
    const eventType = sanitizeEventType(parsed.metaCustomEventType);

    // Validar/normalizar rule: debe ser JSON parseable; si no, reconstruir
    // de forma coherente con event/lead_status sugeridos.
    let metaRule = truncate(parsed.metaRule || "", 2000);
    try {
      JSON.parse(metaRule);
      if (!metaRule) throw new Error("empty");
    } catch {
      metaRule = buildRule(eventName, leadStatus);
    }

    return {
      metaConversionName:
        truncate(parsed.metaConversionName || `Kanban ${name}`, 60) || `Kanban ${name}`,
      metaEventName: eventName,
      metaLeadStatus: leadStatus,
      metaCustomEventType: eventType,
      metaRule,
      reasoning: truncate(parsed.reasoning || "", 150)
    };
  } catch (err: any) {
    logger.warn(`[TagMetaConversionAIService] Error IA: ${err?.message}; usando fallback`);
    return getFallbackMetaRecommendation(name, key);
  }
}

export default TagMetaConversionAIService;
