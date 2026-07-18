/**
 * EmotionStateService — Capa de emoción contextual
 *
 * Envuelve al existente SentimentDetectionService (patrones regex) y lo
 * enriquece con:
 *   - señales del historial reciente (detecta trayectoria)
 *   - fallos acumulados del agente en el ticket (CurrentTicketMemoryService)
 *   - baja confianza sostenida
 *   - pedido explícito de humano
 *
 * Emite un EmotionState amplio (neutral/curious/confused/frustrated/angry)
 * y una decisión de escalación CONTEXTUAL que NO se dispara solo por regex:
 *   para escalar por emoción se exige cruzar varias señales. Frustración
 *   severa simple NO escala sola — respetamos la regla del usuario.
 *
 * El contenido factual de la respuesta NO lo decide este servicio: solo
 * aporta instrucciones de TONO y flags para el planner/gatekeeper.
 */
import SentimentDetectionService, { SentimentResult } from "./SentimentDetectionService";
import type { CurrentTicketMemory } from "./CurrentTicketMemoryService";
import logger from "../../utils/logger";

const PREFIX = "[EmotionState]";

export type EmotionState =
  | "neutral" | "positive" | "curious" | "confused" | "frustrated" | "angry";

export interface EmotionEvaluationInput {
  text: string;
  ticketHistory: Array<{ role: string; content: string }>;
  ticketMemory?: CurrentTicketMemory | null;
  lastAgentConfidence?: number;       // confianza del último turno del bot
  userRequestedHuman?: boolean;        // detectado aguas arriba
  sensitiveIntent?: boolean;           // p.ej. queja legal, pago fallido
}

export interface EmotionEvaluation {
  state: EmotionState;
  baseSentiment: SentimentResult;
  frustrationLevel: 0 | 1 | 2 | 3;
  signals: string[];
  // Señal combinada: ¿deberíamos escalar por contexto emocional+operativo?
  escalationRecommended: boolean;
  escalationReason?: string;
  toneInstructions: string;
}

// ─────────────────────── Patrones auxiliares ────────────────────

const CONFUSED_PATTERNS = [
  /\bno (entiendo|entendí|me queda claro|estoy seguro)\b/i,
  /\b(puedes|podría[ns]?)\s+(explicar|aclarar|repetir)\b/i,
  /\b(qué|que)\s+(significa|quiere decir)\b/i,
  /\b(no|todavía no)\s+me\s+convenc/i,
  /\b(me (pierdo|confundo))\b/i
];

const CURIOUS_PATTERNS = [
  /\b(c[oó]mo funciona|en qué consiste|para qué sirve)\b/i,
  /\b(me interesa saber|quisiera conocer)\b/i,
  /\b(qué|cuáles?)\s+(beneficios|ventajas)\b/i
];

const ANGRY_PATTERNS = [
  /\b(ya\s+dije|ya\s+te\s+dije|otra\s+vez)\b/i,
  /\b(no\s+(les\s+)?entiendo\s+nada)\b/i,
  /(😡|🤬|🤡)/
];

// ─────────────────────── Eval ───────────────────────────────────

const evaluate = (input: EmotionEvaluationInput): EmotionEvaluation => {
  const base = SentimentDetectionService.analyze(input.text || "");
  const signals: string[] = [];

  // Arranque con la señal base
  let state: EmotionState = "neutral";
  if (base.sentiment === "positive") state = "positive";
  if (base.sentiment === "negative") state = "frustrated";
  if (base.sentiment === "frustrated") state = "frustrated";
  if (base.frustrationLevel >= 3) state = "angry";

  // Detecta confusión / curiosidad sobre la base de patrones finos
  if (state === "neutral" || state === "positive") {
    if (CONFUSED_PATTERNS.some(p => p.test(input.text))) {
      state = "confused"; signals.push("confused_pattern");
    } else if (CURIOUS_PATTERNS.some(p => p.test(input.text))) {
      state = "curious"; signals.push("curious_pattern");
    }
  }

  // Trayectoria: si los últimos 3 turnos del usuario fueron negativos, elevamos
  const userMsgs = (input.ticketHistory || [])
    .filter(m => m.role === "user")
    .slice(-3)
    .map(m => SentimentDetectionService.analyze(m.content || ""));
  const neg = userMsgs.filter(r => r.frustrationLevel >= 2).length;
  if (neg >= 2) {
    signals.push("negative_trajectory");
    if (state === "neutral" || state === "positive" || state === "curious") state = "frustrated";
    if (state === "frustrated" && neg >= 3) state = "angry";
  }

  if (ANGRY_PATTERNS.some(p => p.test(input.text))) {
    signals.push("angry_trigger");
    state = state === "neutral" ? "frustrated" : "angry";
  }

  const frustrationLevel = base.frustrationLevel as 0 | 1 | 2 | 3;

  // ───────────── ESCALACIÓN CONTEXTUAL (no sólo por emoción) ─────────────
  //
  // Regla del usuario: frustración severa NO escala por sí sola.
  // Se exige CRUCE con ≥ 1 señal operativa adicional.
  const operational: string[] = [];
  if (input.userRequestedHuman) operational.push("explicit_human_request");
  if (input.sensitiveIntent) operational.push("sensitive_intent");
  if ((input.lastAgentConfidence ?? 1) < 0.35) operational.push("low_confidence_response");
  if ((input.ticketMemory?.agentFailures ?? 0) >= 2) operational.push("repeated_agent_failures");
  if ((input.ticketMemory?.consecutiveLowConfidence ?? 0) >= 2) operational.push("sustained_low_confidence");
  if (input.ticketMemory?.unresolvedQuestions?.length && input.ticketMemory.unresolvedQuestions.length >= 2) {
    operational.push("unresolved_stack");
  }

  let escalate = false;
  let reason: string | undefined;

  // Sólo si emoción ≥ frustrated y hay al menos 1 señal operativa
  if ((state === "frustrated" || state === "angry") && operational.length >= 1) {
    escalate = true;
    reason = `emotion=${state}, operational=[${operational.join(",")}]`;
  }
  // Pedido explícito de humano siempre escala (respetar deseo del cliente)
  if (input.userRequestedHuman) {
    escalate = true;
    reason = reason || "explicit_human_request";
  }

  const toneInstructions = buildToneInstructions(state, frustrationLevel);

  const evalResult: EmotionEvaluation = {
    state,
    baseSentiment: base,
    frustrationLevel,
    signals: [...signals, ...operational],
    escalationRecommended: escalate,
    escalationReason: reason,
    toneInstructions
  };

  logger.info(
    `${PREFIX} state=${state} freelvl=${frustrationLevel} ` +
    `signals=[${evalResult.signals.join(",")}] escalate=${escalate}`
  );

  return evalResult;
};

function buildToneInstructions(state: EmotionState, frustration: number): string {
  switch (state) {
    case "positive":
      return "TONO: cliente contento. Mantén cercanía y ofrece siguiente paso claro.";
    case "curious":
      return "TONO: cliente curioso. Explica breve, estructurado y ofrece un ejemplo concreto.";
    case "confused":
      return "TONO: cliente confundido. Simplifica, usa pasos numerados, confirma al final con una pregunta cerrada.";
    case "frustrated":
      return "TONO: cliente frustrado. 1) Valida la frustración en 1 frase breve. 2) Da la respuesta concreta SIN repetir lo ya dicho. 3) Ofrece un asesor humano si persiste. NO uses disculpas robóticas.";
    case "angry":
      return "TONO: cliente enojado. Prioriza desescalado. Reconoce el problema, ofrece transferencia inmediata a asesor humano. No intentes resolverlo tú solo si la fricción persiste.";
    case "neutral":
    default:
      return frustration >= 1
        ? "TONO: leve molestia. Sé empático, ve al grano, ofrece solución concreta."
        : "";
  }
}

export default { evaluate };
