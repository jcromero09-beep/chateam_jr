/**
 * ResponsePlannerService — Planifica la fuente de la respuesta ANTES de
 * despachar a un agente. Garantiza la prioridad pedida:
 *
 *   1. memoria estructurada del ticket actual    (CurrentTicketMemoryService)
 *   2. QA reciente del ticket actual             (implícito en answeredFacts)
 *   3. QA histórica validada                     (AIHistoricalQA)
 *   4. KB/RAG documental                         (dispatch estándar)
 *   5. tools                                      (dispatch estándar)
 *   6. escalación
 *
 * Si 1-3 resuelven con evidencia fuerte, emite un plan `reuse` que el
 * SupervisorService puede atajar SIN volver a llamar al agente ni a tools.
 *
 * Si 1-3 no resuelven, emite `dispatch` con sugerencia (target agent y
 * razones). El SupervisorService sigue su flujo normal.
 *
 * Latencia: fast path no llama LLM; slow path llama LLM "mini" sólo una vez.
 */
import CurrentTicketMemoryService, {
  CurrentTicketMemory
} from "./CurrentTicketMemoryService";
import HistoricalQARetrieverService from "./HistoricalQARetrieverService";
import MemoryJudgeAgent, {
  JudgeCandidate, JudgeResult
} from "./MemoryJudgeAgent";
import logger from "../../utils/logger";

const PREFIX = "[ResponsePlanner]";

export type PlannerDecision =
  | "reuse"            // responder directo con memoria/qa
  | "clarify"          // pedir aclaración antes de responder
  | "dispatch"         // flujo normal a RAG/Sales/Support/Appointment/Tools
  | "escalate";        // handoff directo

export interface PlannerInput {
  companyId: number;
  ticketId?: number;
  contactId?: number;
  currentMessage: string;
  enrichedQuery?: string;
  hydeQuery?: string;
  intent?: string;
  targetAgentHint?: string;
  // filtros opcionales de matching histórico
  productKey?: string;
  language?: string;
  channel?: string;
  // señales operativas
  emotionState?: string;          // EmotionState.state
  emotionEscalate?: boolean;      // EmotionState.escalationRecommended
  userRequestedHuman?: boolean;
  // memoria ya cargada (evita doble lectura)
  ticketMemory?: CurrentTicketMemory | null;
}

export interface PlannerOutput {
  decision: PlannerDecision;
  sourceType: "current_ticket" | "historical_qa" | "kb" | "tool" | "human" | "none";
  adaptedAnswer?: string;
  historicalQaId?: number;
  confidence: number;
  reasoning: string;
  // metadata útil para logs y gatekeeper
  judge?: JudgeResult;
  candidatesCurrent: number;
  candidatesHistorical: number;
  latencyMs: number;
}

const PLAN_LOG = (out: PlannerOutput) =>
  logger.info(
    `${PREFIX} decision=${out.decision} src=${out.sourceType} ` +
    `cur=${out.candidatesCurrent} hist=${out.candidatesHistorical} ` +
    `conf=${out.confidence.toFixed(2)} lat=${out.latencyMs}ms`
  );

/** Detecta preguntas claramente factuales cortas (candidatas a reuso) */
const looksLikeFactualQuestion = (msg: string): boolean => {
  const m = (msg || "").toLowerCase().trim();
  if (!m) return false;
  if (m.length > 180) return false;
  // si ya trae una pregunta factual
  if (/[¿?]/.test(m)) return true;
  return /\b(tiene|incluye|cuesta|precio|cuanto|cuánto|horario|hay|ofrecen|cómo funciona|como funciona|en qu[eé] consiste)\b/.test(m);
};

const plan = async (input: PlannerInput): Promise<PlannerOutput> => {
  const start = Date.now();

  const {
    companyId, ticketId, currentMessage,
    enrichedQuery, hydeQuery, intent, productKey, language, channel
  } = input;

  // ── Circuit breakers por señal operativa ────────────────────────────
  if (input.userRequestedHuman) {
    const out: PlannerOutput = {
      decision: "escalate", sourceType: "human",
      confidence: 0.95,
      reasoning: "usuario pidió humano explícito",
      candidatesCurrent: 0, candidatesHistorical: 0,
      latencyMs: Date.now() - start
    };
    PLAN_LOG(out); return out;
  }
  if (input.emotionEscalate) {
    const out: PlannerOutput = {
      decision: "escalate", sourceType: "human",
      confidence: 0.88,
      reasoning: "emotion+contexto operativo sugieren escalar",
      candidatesCurrent: 0, candidatesHistorical: 0,
      latencyMs: Date.now() - start
    };
    PLAN_LOG(out); return out;
  }

  // ── 1. Memoria del ticket actual ────────────────────────────────────
  let mem = input.ticketMemory;
  if (!mem && ticketId) {
    mem = await CurrentTicketMemoryService.load(ticketId, companyId, input.contactId);
  }

  const candidatesCurrent: JudgeCandidate[] = [];
  if (mem) {
    const match = CurrentTicketMemoryService.findAnsweredFact(mem, currentMessage, 0.55);
    if (match) candidatesCurrent.push({ type: "current_ticket", fact: match.fact, score: match.score });
  }

  // ── 2. QA histórica (sólo si la pregunta parece factual/seguimiento
  //      o si el match del ticket actual no es muy alto) ───────────────
  const shouldQueryHistorical =
    looksLikeFactualQuestion(currentMessage) &&
    (!candidatesCurrent.length || (candidatesCurrent[0] as any).score < 0.9);

  let historicalCandidates: JudgeCandidate[] = [];
  if (shouldQueryHistorical) {
    const verifiedRows = await HistoricalQARetrieverService.retrieve({
      companyId,
      currentMessage,
      enrichedQuery,
      hydeQuery,
      intent,
      language,
      channel,
      productKey,
      onlyVerified: true,
      limit: 5
    });

    let autoVerifiedRows: typeof verifiedRows = [];
    if (verifiedRows.length < 2) {
      const relaxedRows = await HistoricalQARetrieverService.retrieve({
        companyId,
        currentMessage,
        enrichedQuery,
        hydeQuery,
        intent,
        language,
        channel,
        productKey,
        onlyVerified: false,
        semanticThreshold: 0.82,
        trigramThreshold: 0.42,
        maxAgeDays: 45,
        limit: 5
      });

      autoVerifiedRows = relaxedRows.filter(qa => {
        if (qa.verified) return false;
        if (!["kb_backed", "tool_backed", "ai_verified"].includes(qa.answerType)) return false;
        if ((qa.rating ?? 1) < 0.7) return false;
        return qa.hybridScore >= 0.82 && (qa.similarity >= 0.78 || qa.trigramSimilarity >= 0.65);
      }).slice(0, 3);
    }

    const seen = new Set<number>();
    const histRows = [...verifiedRows, ...autoVerifiedRows].filter(qa => {
      if (seen.has(qa.id)) return false;
      seen.add(qa.id);
      return true;
    });

    historicalCandidates = histRows.map(qa => ({ type: "historical_qa" as const, qa }));
  }

  const candidates: JudgeCandidate[] = [
    ...candidatesCurrent,
    ...historicalCandidates
  ];

  // ── 3. Si no hay candidatos → dispatch clásico ──────────────────────
  if (candidates.length === 0) {
    const out: PlannerOutput = {
      decision: "dispatch", sourceType: "none",
      confidence: 0.5,
      reasoning: "sin evidencia memoria/histórica aplicable — dispatch normal",
      candidatesCurrent: candidatesCurrent.length,
      candidatesHistorical: historicalCandidates.length,
      latencyMs: Date.now() - start
    };
    PLAN_LOG(out); return out;
  }

  // ── 4. MemoryJudge (fast path o LLM mini) ───────────────────────────
  const judge = await MemoryJudgeAgent.evaluate({
    companyId,
    currentMessage,
    enrichedQuery,
    intent,
    ticketMemory: mem,
    candidates,
    productKey,
    language
  });

  if (judge.shouldUse && judge.chosen && judge.adaptedAnswer) {
    const historicalQaId = judge.chosen.type === "historical_qa"
      ? judge.chosen.qa.id : undefined;

    // Si viene de historical_qa, aumentamos usedCount asincrónicamente
    if (historicalQaId) {
      void HistoricalQARetrieverService.markUsed(historicalQaId);
    }

    const out: PlannerOutput = {
      decision: "reuse",
      sourceType: judge.sourceType === "current_ticket" ? "current_ticket" : "historical_qa",
      adaptedAnswer: judge.adaptedAnswer,
      historicalQaId,
      confidence: judge.relevanceScore,
      reasoning: judge.reason,
      judge,
      candidatesCurrent: candidatesCurrent.length,
      candidatesHistorical: historicalCandidates.length,
      latencyMs: Date.now() - start
    };
    PLAN_LOG(out); return out;
  }

  // ── 5. No reutilizable → dispatch normal
  const out: PlannerOutput = {
    decision: "dispatch",
    sourceType: "none",
    confidence: judge.relevanceScore,
    reasoning: judge.reason || "Juez determinó que no hay evidencia suficiente",
    judge,
    candidatesCurrent: candidatesCurrent.length,
    candidatesHistorical: historicalCandidates.length,
    latencyMs: Date.now() - start
  };
  PLAN_LOG(out); return out;
};

export default { plan };
