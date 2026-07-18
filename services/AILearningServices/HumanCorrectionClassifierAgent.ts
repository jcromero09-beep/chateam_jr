/**
 * HumanCorrectionClassifierAgent — Clasificador LLM-mini de correcciones humanas.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Recibe el par (respuesta IA, mensaje humano) + contexto del ticket y decide:
 *   - ¿Es realmente una corrección o solo un mensaje agente normal?
 *   - ¿Qué tipo de corrección es? (factual, precio, política, cita, pago...)
 *   - ¿Cuál era el claim incorrecto de la IA y cuál el correcto del humano?
 *   - ¿Sobre qué entidad/campo aplica?
 *   - ¿Qué alcance tiene? (companyId, queueId, productKey, intent)
 *   - ¿Requiere aprobación humana antes de aprenderse?
 *
 * Modelo: gpt-5.5 (configurable vía AI_LEARNING_CLASSIFIER_MODEL),
 *         temperature 0.1, JSON mode, ~600 tokens de prompt máx.
 *
 * Defensivo:
 *   - Si el LLM falla o devuelve JSON inválido → retorna isCorrection=false
 *     con confidence=0 y reason explícito. NUNCA lanza.
 *   - Filtra heurísticamente correcciones obvias (texto muy corto, solo emojis)
 *     antes de invocar el LLM para ahorrar tokens.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

import AILearningFeatureFlag from "./AILearningFeatureFlag";
import CorrectionScopeMatcher, { CorrectionScope } from "./CorrectionScopeMatcher";
import logger from "../../utils/logger";

const PREFIX = "[HumanCorrectionClassifier]";

export type CorrectionTypeKey =
  | "factual_contradiction"
  | "price_correction"
  | "policy_correction"
  | "appointment_override"
  | "status_override"
  | "payment_override"
  | "contract_override"
  | "availability_override"
  | "human_clarification"
  | "sales_strategy_override"
  | "not_correction";

export interface ClassifyInput {
  companyId: number;
  ticketId?: number;
  lastAiResponse: string;
  humanMessage: string;
  ticketState?: {
    status?: string;
    queueId?: number | null;
    queueName?: string | null;
    queuePromptAI?: string | null;
  };
  tags?: string[];
  kanban?: string;
  detectedProduct?: string;
  toolsUsedByAI?: string[];
  intent?: string;
  /** Hechos vivos de tools del último turno, si están disponibles. */
  liveDbFacts?: Record<string, string>;
}

export interface ClassifyResult {
  isCorrection: boolean;
  correctionType: CorrectionTypeKey;
  confidence: number;
  wrongAiClaim?: string;
  correctHumanClaim?: string;
  entity?: string;
  field?: string;
  scope: CorrectionScope;
  shouldWriteToZep: boolean;            // siempre false en Sprint 1
  shouldUpdateAIHistoricalQA: boolean;
  requiresHumanApproval: boolean;
  reason: string;
  classifierLatencyMs: number;
  classifierTokens: { input: number; output: number };
  modelUsed: string;
}

// ── Heurísticas pre-LLM para ahorrar tokens ─────────────────────────

const NOISE_REGEX = /^(ok|okay|gracias|👍|👌|🙏|ya|listo|si|no|claro|dale|perfecto|entendido|chao|adios|adiós|bye)[\s\.\!]*$/i;

const looksLikeNoise = (text: string): boolean => {
  const t = (text || "").trim();
  if (t.length < 3) return true;
  if (NOISE_REGEX.test(t)) return true;
  // Solo emojis
  const noEmojis = t.replace(/[\p{Emoji_Presentation}\p{Emoji}‍️]/gu, "").trim();
  if (noEmojis.length === 0) return true;
  return false;
};

const buildNotCorrectionResult = (
  companyId: number,
  intent: string | undefined,
  reason: string,
  startedAt: number,
  modelUsed: string
): ClassifyResult => ({
  isCorrection: false,
  correctionType: "not_correction",
  confidence: 0,
  scope: { companyId, intent },
  shouldWriteToZep: false,
  shouldUpdateAIHistoricalQA: false,
  requiresHumanApproval: false,
  reason,
  classifierLatencyMs: Date.now() - startedAt,
  classifierTokens: { input: 0, output: 0 },
  modelUsed
});

// ── Prompt builder (compacto, <600 tokens) ──────────────────────────

const buildPrompt = (input: ClassifyInput): string => {
  const toolsLine = input.toolsUsedByAI && input.toolsUsedByAI.length
    ? input.toolsUsedByAI.join(", ")
    : "(ninguna)";

  const factsLine = input.liveDbFacts && Object.keys(input.liveDbFacts).length
    ? Object.entries(input.liveDbFacts).map(([k, v]) => `${k}=${v}`).join(" | ")
    : "(sin hechos vivos disponibles)";

  const tagsLine = input.tags && input.tags.length ? input.tags.join(", ") : "(sin tags)";

  return `Eres un clasificador de correcciones humanas en un CRM omnicanal multi-empresa.

Un agente humano leyó la respuesta del bot y envió un mensaje. Decide si ese mensaje humano CORRIGE algo que el bot dijo mal, o si es solo un mensaje normal del agente al cliente.

## CONTEXTO
companyId: ${input.companyId}
ticketId: ${input.ticketId ?? "n/a"}
queueId: ${input.ticketState?.queueId ?? "n/a"} | queueName: ${input.ticketState?.queueName ?? "n/a"}
intent del turno: ${input.intent ?? "desconocido"}
tags del ticket: ${tagsLine}
kanban: ${input.kanban ?? "n/a"}
producto detectado: ${input.detectedProduct ?? "n/a"}
tools que el bot usó: ${toolsLine}
hechos vivos del último turno: ${factsLine}

## RESPUESTA DEL BOT
"""
${(input.lastAiResponse || "").slice(0, 1500)}
"""

## MENSAJE DEL HUMANO
"""
${(input.humanMessage || "").slice(0, 1500)}
"""

## TIPOS DE CORRECCIÓN POSIBLES
- factual_contradiction → el humano contradice un hecho concreto que el bot dio
- price_correction → el humano corrige un precio, costo o monto que el bot dijo
- policy_correction → el humano corrige una política, condición o reglamento
- appointment_override → el humano corrige info de citas/agendamiento
- status_override → el humano corrige el estado de un pedido, ticket o trámite
- payment_override → el humano corrige info sobre pagos, transferencias, comprobantes
- contract_override → el humano corrige cláusulas de un contrato
- availability_override → el humano corrige disponibilidad de horarios/stock
- human_clarification → el humano amplía/aclara sin contradecir al bot
- sales_strategy_override → el humano cambia el ángulo de venta sugerido por el bot
- not_correction → el humano no está corrigiendo, solo respondió/escribió algo más

## REGLAS
1. Si el humano dice exactamente lo mismo o complementa sin contradecir, NO es corrección.
2. Si el humano contradice o corrige al bot, identifica EL claim INCORRECTO del bot y EL claim CORRECTO del humano lo más literal posible.
3. Si el humano da un precio, fecha, condición distinta a la que el bot dio, ese es el caso típico.
4. Si dudas entre 2 tipos, elige el MÁS específico.
5. entity = sujeto/objeto (ej: "GPS", "Plan Pro", "consulta médica"); field = atributo (ej: "price", "warranty", "appointment_date").
6. confidence ∈ [0,1]. Si no estás seguro de que sea corrección, baja a 0.5 o menos.
7. scope.queueId solo si el contexto lo justifica explícitamente; scope.productKey solo si el bot/humano mencionan ese producto; scope.intent del turno actual cuando aplique.

## SALIDA: SOLO JSON, sin markdown.
{
  "isCorrection": boolean,
  "correctionType": "factual_contradiction|price_correction|policy_correction|appointment_override|status_override|payment_override|contract_override|availability_override|human_clarification|sales_strategy_override|not_correction",
  "confidence": 0.00-1.00,
  "wrongAiClaim": "string corto o null",
  "correctHumanClaim": "string corto o null",
  "entity": "string o null",
  "field": "string o null",
  "scope": { "queueId": number|null, "productKey": "string|null", "intent": "string|null" },
  "reason": "1 frase de explicación"
}`;
};

// ── Parser defensivo de la respuesta LLM ─────────────────────────────

const parseLLMResponse = (raw: string): Partial<ClassifyResult> | null => {
  try {
    // Limpiar posibles fences de markdown si el LLM los puso
    const cleaned = raw
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned);
    if (typeof obj !== "object" || obj === null) return null;
    return obj as Partial<ClassifyResult>;
  } catch {
    return null;
  }
};

// ── Función principal ────────────────────────────────────────────────

export const classify = async (input: ClassifyInput): Promise<ClassifyResult> => {
  const startedAt = Date.now();
  const modelUsed = AILearningFeatureFlag.getClassifierModel();

  // 1. Heurística de descarte sin LLM
  if (looksLikeNoise(input.humanMessage)) {
    return buildNotCorrectionResult(
      input.companyId, input.intent,
      "humanMessage es ruido (gracias/ok/emoji/etc.)",
      startedAt, modelUsed
    );
  }
  if (!input.lastAiResponse || input.lastAiResponse.trim().length < 5) {
    return buildNotCorrectionResult(
      input.companyId, input.intent,
      "no hay respuesta IA previa relevante para contrastar",
      startedAt, modelUsed
    );
  }

  // 2. LLM
  try {
    const AIClientService = require("../AIClientService");
    const generateText = AIClientService.generateText || AIClientService.default?.generateText;
    if (typeof generateText !== "function") {
      logger.warn(`${PREFIX} generateText no disponible — fallback no-correction`);
      return buildNotCorrectionResult(
        input.companyId, input.intent,
        "AIClientService.generateText no disponible",
        startedAt, modelUsed
      );
    }

    const prompt = buildPrompt(input);

    const llmResponse = await generateText({
      prompt,
      modelKey: modelUsed,
      maxTokens: 500,
      temperature: 0.1,
      responseFormat: "json",
      companyId: input.companyId
    });

    const parsed = parseLLMResponse(llmResponse.text || "");

    if (!parsed) {
      logger.warn(`${PREFIX} JSON inválido del LLM — fallback no-correction. raw="${(llmResponse.text || "").slice(0, 150)}"`);
      return buildNotCorrectionResult(
        input.companyId, input.intent,
        "JSON inválido en respuesta LLM",
        startedAt, modelUsed
      );
    }

    // 3. Sanitización defensiva del JSON
    const isCorrection = Boolean(parsed.isCorrection);
    const rawType = String(parsed.correctionType || "not_correction");

    const validTypes: CorrectionTypeKey[] = [
      "factual_contradiction", "price_correction", "policy_correction",
      "appointment_override", "status_override", "payment_override",
      "contract_override", "availability_override",
      "human_clarification", "sales_strategy_override", "not_correction"
    ];
    const correctionType: CorrectionTypeKey = validTypes.includes(rawType as CorrectionTypeKey)
      ? (rawType as CorrectionTypeKey)
      : "not_correction";

    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0;

    const scopeRaw = (parsed as any).scope || {};
    const scope = CorrectionScopeMatcher.normalizeScope(
      {
        queueId: scopeRaw.queueId ?? input.ticketState?.queueId,
        productKey: scopeRaw.productKey ?? input.detectedProduct,
        intent: scopeRaw.intent ?? input.intent
      },
      input.companyId
    );

    const requiresHumanApproval = AILearningFeatureFlag.requiresHumanReview(
      correctionType, confidence
    );

    // Solo proponemos supersede de AIHistoricalQA para tipos NO críticos con
    // alta confianza. Crítico SIEMPRE va a review primero.
    const shouldUpdateAIHistoricalQA = isCorrection &&
      correctionType !== "not_correction" &&
      correctionType !== "human_clarification" &&
      !requiresHumanApproval;

    const result: ClassifyResult = {
      isCorrection: isCorrection && correctionType !== "not_correction",
      correctionType,
      confidence,
      wrongAiClaim: typeof parsed.wrongAiClaim === "string" ? parsed.wrongAiClaim.slice(0, 1500) : undefined,
      correctHumanClaim: typeof parsed.correctHumanClaim === "string" ? parsed.correctHumanClaim.slice(0, 1500) : undefined,
      entity: typeof parsed.entity === "string" ? parsed.entity.slice(0, 120) : undefined,
      field: typeof parsed.field === "string" ? parsed.field.slice(0, 60) : undefined,
      scope,
      shouldWriteToZep: false,
      shouldUpdateAIHistoricalQA,
      requiresHumanApproval,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 280) : "",
      classifierLatencyMs: Date.now() - startedAt,
      classifierTokens: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil((llmResponse.text || "").length / 4)
      },
      modelUsed
    };

    logger.info(
      `${PREFIX} ticket=${input.ticketId ?? "?"} type=${result.correctionType} ` +
      `conf=${result.confidence.toFixed(2)} review=${result.requiresHumanApproval} ` +
      `lat=${result.classifierLatencyMs}ms`
    );

    return result;
  } catch (err: any) {
    logger.warn(`${PREFIX} error inesperado: ${err.message}`);
    return buildNotCorrectionResult(
      input.companyId, input.intent,
      `error: ${err.message}`,
      startedAt, modelUsed
    );
  }
};

export default { classify };
