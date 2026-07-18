import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * MemoryJudgeAgent — Evaluador de evidencia antes de responder
 *
 * Toma candidatos de:
 *   1) el ticket actual (answeredFact match)
 *   2) AIHistoricalQA cross-ticket
 *   3) AISupportCorrections (ya integradas como "prioridad máxima" en PromptContextBuilder)
 *
 * Decide si alguna evidencia responde REALMENTE la pregunta actual. Usa un
 * path LIGERO sin LLM cuando la señal es fuerte, y un LLM "mini" como juez
 * sólo cuando hay duda razonable. Si ninguna aplica → shouldUse=false y el
 * SupervisorService cae al dispatch clásico (RAG/tools).
 *
 * Nunca usa evidencia obsoleta: filtra superseded y freshness, y exige
 * compatibilidad de producto/plan/idioma (ese filtrado ocurre antes en
 * HistoricalQARetrieverService; aquí validamos coherencia semántica).
 */
import { selectModel } from "./ModelRouterService";
import type { AnsweredFact, CurrentTicketMemory } from "./CurrentTicketMemoryService";
import type { HistoricalQACandidate } from "./HistoricalQARetrieverService";
import logger from "../../utils/logger";

const PREFIX = "[MemoryJudge]";

export type JudgeSource =
  | "current_ticket" | "historical_qa" | "none";

export interface JudgeCandidateCurrent {
  type: "current_ticket";
  fact: AnsweredFact;
  score: number;
}
export interface JudgeCandidateHistorical {
  type: "historical_qa";
  qa: HistoricalQACandidate;
}
export type JudgeCandidate = JudgeCandidateCurrent | JudgeCandidateHistorical;

export interface JudgeInput {
  companyId: number;
  currentMessage: string;
  enrichedQuery?: string;
  intent?: string;
  ticketMemory?: CurrentTicketMemory | null;
  candidates: JudgeCandidate[];
  // Filtros de contexto conocido (producto/plan) — si no matchea, rebajamos
  productKey?: string;
  language?: string;
}

export interface JudgeResult {
  shouldUse: boolean;
  sourceType: JudgeSource;
  chosen?: JudgeCandidate;
  relevanceScore: number;      // 0..1
  freshnessScore: number;      // 0..1
  consistencyScore: number;    // 0..1 (vs answeredFacts previos)
  adaptedAnswer?: string;
  reason: string;
  latencyMs: number;
  modelUsed: string;
}

// ──────────────── Thresholds (configurables por env en el futuro) ───────────

const HARD_ACCEPT_CURRENT = 0.80;   // si match del ticket actual es muy alto → aceptar sin LLM
const HARD_ACCEPT_HISTORICAL = 0.86; // si el historical tiene hybridScore muy alto → aceptar sin LLM
const MIN_RELEVANCE = 0.55;          // por debajo de esto no vale la pena ni llamar LLM
const MAX_CANDIDATES_TO_LLM = 3;

// ──────────────── Utilidades ──────────────────────────────

const consistencyWithMemory = (
  answer: string,
  mem?: CurrentTicketMemory | null
): number => {
  if (!mem || !mem.answeredFacts.length) return 1.0;
  // Si el candidato contradice obviamente un hecho previo (negación burda), castigar
  const lower = (answer || "").toLowerCase();
  let penalty = 0;
  for (const f of mem.answeredFacts) {
    const fAns = (f.answer || "").toLowerCase();
    // heurística simple: si ambos contienen la misma keyword pero uno dice "no" y el otro "sí"
    const keywords = ["sí", "si ", "no ", "incluye", "no incluye", "gratis", "pago"];
    for (const k of keywords) {
      if (lower.includes(k) && fAns.includes(k) && lower.slice(0, 80) !== fAns.slice(0, 80)) {
        // coincidencia parcial, no necesariamente contradicción
      }
    }
    // si contradice explícitamente "no" vs "sí" sobre el mismo tópico, penaliza
    if (/\bno\s+(tiene|incluye|ofrece)/.test(lower) && /\bs[ií]\s+(tiene|incluye|ofrece)/.test(fAns)) penalty += 0.4;
    if (/\bs[ií]\s+(tiene|incluye|ofrece)/.test(lower) && /\bno\s+(tiene|incluye|ofrece)/.test(fAns)) penalty += 0.4;
  }
  return Math.max(0, 1 - penalty);
};

const freshnessOf = (cand: JudgeCandidate): number => {
  if (cand.type === "current_ticket") return 1.0;
  const days = cand.qa.freshnessDays;
  if (days <= 30) return 1.0;
  if (days <= 90) return 0.85;
  if (days <= 180) return 0.65;
  return 0.4;
};

const relevanceOf = (cand: JudgeCandidate): number => {
  if (cand.type === "current_ticket") return Math.min(1, cand.score + 0.25); // boost por origen
  return cand.qa.hybridScore;
};

// ──────────────── Judge (LLM mini) ────────────────────────

const judgeWithLLM = async (
  input: JudgeInput,
  shortlist: JudgeCandidate[]
): Promise<JudgeResult> => {
  const startTime = Date.now();
  try {
    const modelSel = await selectModel("judge", input.currentMessage, "mini");
    const modelKey = modelSel?.entity.key || "gpt-5.5";

    const candidatesText = shortlist.map((c, i) => {
      if (c.type === "current_ticket") {
        return `### Candidato ${i + 1} — fuente=current_ticket (turno #${c.fact.turnId}, source=${c.fact.source}, confidence=${c.fact.confidence.toFixed(2)})
PREGUNTA original: ${c.fact.question}
RESPUESTA dada: ${c.fact.answer}`;
      }
      return `### Candidato ${i + 1} — fuente=historical_qa (id=${c.qa.id}, tipo=${c.qa.answerType}, usado=${c.qa.usedCount}x, edad=${c.qa.freshnessDays.toFixed(0)}d, producto=${c.qa.productKey || "-"})
PREGUNTA original: ${c.qa.question}
RESPUESTA dada: ${c.qa.answer}`;
    }).join("\n\n");

    const prompt = `Eres un auditor que decide si una respuesta previa ya dada responde correctamente la pregunta actual del cliente.

## PREGUNTA ACTUAL DEL CLIENTE
"${input.currentMessage}"
Intent: ${input.intent || "desconocido"}
${input.productKey ? `Producto / plan: ${input.productKey}` : ""}

## CANDIDATOS DE RESPUESTA (ordenados por relevancia previa)
${candidatesText}

## TU TAREA
Decide SI alguna de estas respuestas responde la pregunta actual del cliente EXACTAMENTE.
Si aplica, elige la MEJOR y devuélvela adaptada MINIMALMENTE al turno actual (sin inventar datos nuevos). Si ninguna aplica, di que no.

REGLAS:
- NO uses un candidato si habla de un producto/plan distinto.
- NO uses un candidato si está desactualizado y el cliente pide datos sensibles (precio, horarios).
- NO contradigas respuestas previas del ticket actual.
- Si la pregunta es muy distinta o requiere datos en vivo, rechaza todos y usa shouldUse=false.

Responde SOLO con JSON válido:
{
  "shouldUse": true|false,
  "chosenIndex": 1|2|3|null,
  "relevanceScore": 0.0-1.0,
  "adaptedAnswer": "texto final a enviar al cliente (mismo idioma, sin inventar)",
  "reason": "1-2 frases justificando"
}`;

    const AIClientService = require("../AIClientService").default;
    const response = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: 450,
      temperature: 0.15,
      responseFormat: "json",
      companyId: input.companyId
    });

    let parsed: any = {};
    try { parsed = JSON.parse(response.text || "{}"); } catch { parsed = {}; }

    const idx: number | null = typeof parsed.chosenIndex === "number"
      ? (parsed.chosenIndex - 1) : null;
    const chosen = (idx !== null && idx >= 0 && idx < shortlist.length)
      ? shortlist[idx] : undefined;

    const shouldUse = !!parsed.shouldUse && !!chosen;
    const relevance = typeof parsed.relevanceScore === "number"
      ? Math.max(0, Math.min(1, parsed.relevanceScore)) : 0;
    const freshness = chosen ? freshnessOf(chosen) : 0;
    const consistency = consistencyWithMemory(parsed.adaptedAnswer || "", input.ticketMemory);

    return {
      shouldUse: shouldUse && relevance >= MIN_RELEVANCE && consistency >= 0.6,
      sourceType: chosen
        ? (chosen.type === "current_ticket" ? "current_ticket" : "historical_qa")
        : "none",
      chosen,
      relevanceScore: relevance,
      freshnessScore: freshness,
      consistencyScore: consistency,
      adaptedAnswer: parsed.adaptedAnswer ||
        (chosen
          ? (chosen.type === "current_ticket" ? chosen.fact.answer : chosen.qa.answer)
          : undefined),
      reason: parsed.reason || "Decisión del juez",
      latencyMs: Date.now() - startTime,
      modelUsed: modelKey
    };
  } catch (e: any) {
    logger.warn(`${PREFIX} LLM judge falló (${e.message}). Fallback: no usar memoria.`);
    return {
      shouldUse: false,
      sourceType: "none",
      relevanceScore: 0,
      freshnessScore: 0,
      consistencyScore: 1,
      reason: `Judge falló: ${e.message}`,
      latencyMs: Date.now() - startTime,
      modelUsed: "fallback"
    };
  }
};

// ──────────────── Entry point ─────────────────────────────

const evaluate = async (input: JudgeInput): Promise<JudgeResult> => {
  const startTime = Date.now();

  if (!input.candidates || input.candidates.length === 0) {
    return {
      shouldUse: false,
      sourceType: "none",
      relevanceScore: 0,
      freshnessScore: 0,
      consistencyScore: 1,
      reason: "sin candidatos",
      latencyMs: Date.now() - startTime,
      modelUsed: "none"
    };
  }

  // Ordenar por relevancia descendente
  const ranked = input.candidates
    .map(c => ({ c, rel: relevanceOf(c), fresh: freshnessOf(c) }))
    .sort((a, b) => b.rel - a.rel);

  const best = ranked[0];

  // FAST PATH 1 — current_ticket con match alto → devolver SIN LLM
  if (best.c.type === "current_ticket" && best.rel >= HARD_ACCEPT_CURRENT) {
    const cons = consistencyWithMemory(best.c.fact.answer, input.ticketMemory);
    logger.info(
      `${PREFIX} FAST current_ticket id=${best.c.fact.id} rel=${best.rel.toFixed(2)} cons=${cons.toFixed(2)}`
    );
    return {
      shouldUse: true,
      sourceType: "current_ticket",
      chosen: best.c,
      relevanceScore: best.rel,
      freshnessScore: 1,
      consistencyScore: cons,
      adaptedAnswer: best.c.fact.answer,
      reason: "Match fuerte con respuesta previa del mismo ticket — reuso sin LLM",
      latencyMs: Date.now() - startTime,
      modelUsed: "fast-path"
    };
  }

  // FAST PATH 2 — historical con score muy alto Y freshness buena
  if (best.c.type === "historical_qa" && best.rel >= HARD_ACCEPT_HISTORICAL && best.fresh >= 0.8) {
    const cons = consistencyWithMemory(best.c.qa.answer, input.ticketMemory);
    if (cons >= 0.75) {
      logger.info(
        `${PREFIX} FAST historical_qa id=${best.c.qa.id} rel=${best.rel.toFixed(2)} fresh=${best.fresh.toFixed(2)}`
      );
      return {
        shouldUse: true,
        sourceType: "historical_qa",
        chosen: best.c,
        relevanceScore: best.rel,
        freshnessScore: best.fresh,
        consistencyScore: cons,
        adaptedAnswer: best.c.qa.answer,
        reason: "Match fuerte con QA histórica verificada — reuso sin LLM",
        latencyMs: Date.now() - startTime,
        modelUsed: "fast-path"
      };
    }
  }

  // SLOW PATH — LLM judge si hay al menos un candidato por encima de MIN_RELEVANCE
  const shortlist = ranked
    .filter(r => r.rel >= MIN_RELEVANCE)
    .slice(0, MAX_CANDIDATES_TO_LLM)
    .map(r => r.c);

  if (shortlist.length === 0) {
    return {
      shouldUse: false,
      sourceType: "none",
      relevanceScore: best.rel,
      freshnessScore: best.fresh,
      consistencyScore: 1,
      reason: `Todos los candidatos por debajo de MIN_RELEVANCE=${MIN_RELEVANCE}`,
      latencyMs: Date.now() - startTime,
      modelUsed: "none"
    };
  }

  return judgeWithLLM(input, shortlist);
};

export default { evaluate };
