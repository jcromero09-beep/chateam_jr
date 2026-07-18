import type { CurrentTicketMemory } from "./CurrentTicketMemoryService";
import type { RelevantQuickReply } from "./QuickReplySemanticService";

type HistoryLine = { role: string; content: string };

export interface QuickReplyLookupContext {
  currentMessage: string;
  enrichedQuery?: string;
  ticketHistory?: HistoryLine[];
  ticketMemory?: CurrentTicketMemory | null;
}

export interface QuickReplyLookupPlan {
  searchQuery: string;
  allowPromptContext: boolean;
  reason: string;
}

export interface QuickReplySendDecision {
  shouldSend: boolean;
  candidate?: RelevantQuickReply;
  reason: string;
}

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "y",
  "o", "u", "que", "como", "cuando", "donde", "para", "con", "sin", "por", "favor",
  "me", "mi", "tu", "tus", "te", "lo", "la", "le", "les", "es", "son", "ser",
  "plan", "planes", "gps", "track", "smarttrack", "quiero", "necesito", "tengo"
]);

const BLOCKED_INTENTS = new Set([
  "appointment_request",
  "appointment_reschedule",
  "appointment_cancel",
  "escalation",
  "complaint",
  "farewell",
  "greeting"
]);

const QUALIFICATION_PATTERNS = [
  /presupuesto/i,
  /que\s+(auto|carro|vehiculo|vehículo|moto|camion|camión)/i,
  /tipo\s+de\s+(vehiculo|vehículo|auto|carro|moto)/i,
  /para\s+recomendarte/i,
  /para\s+cotizarte/i,
  /que\s+uso/i,
  /que\s+necesitas/i,
  /me\s+indicas/i,
  /me\s+confirmas/i,
  /cual\s+es\s+tu/i,
  /cu[aá]l\s+es\s+tu/i,
  /dime\s+si/i
];

const RECOMMENDATION_PATTERNS = [
  /te\s+recomiendo/i,
  /te\s+conviene/i,
  /la\s+mejor\s+opcion/i,
  /la\s+mejor\s+opción/i,
  /ideal\s+para\s+ti/i,
  /te\s+comparto/i,
  /te\s+envio/i,
  /te\s+envío/i,
  /te\s+paso/i,
  /aqui\s+tienes/i,
  /aquí\s+tienes/i,
  /esta\s+es\s+la\s+opcion/i,
  /esta\s+es\s+la\s+opción/i
];

const normalize = (value?: string): string => {
  return (value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenize = (value?: string): string[] => {
  return normalize(value)
    .split(/\s+/)
    .filter(token => token && token.length >= 3 && !STOPWORDS.has(token));
};

const dedupeParts = (values: string[]): string => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = (raw || "").trim();
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output.join(" | ");
};

const getLastAssistantMessage = (ticketHistory: HistoryLine[] = []): string => {
  const lastAssistant = [...ticketHistory]
    .reverse()
    .find(item => item.role === "assistant" && (item.content || "").trim().length > 0);

  return lastAssistant?.content || "";
};

const isShortSlotAnswer = (message: string): boolean => {
  const normalized = normalize(message);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  return Boolean(
    normalized &&
    !normalized.includes("?") &&
    tokens.length > 0 &&
    tokens.length <= 3 &&
    normalized.length <= 32
  );
};

const isQualificationTurn = (text: string): boolean => {
  const value = normalize(text);
  return QUALIFICATION_PATTERNS.some(pattern => pattern.test(value));
};

const hasRecommendationCue = (text: string): boolean => {
  const value = normalize(text);
  return RECOMMENDATION_PATTERNS.some(pattern => pattern.test(value));
};

const extractStrongTerms = (reply: RelevantQuickReply): string[] => {
  const firstLine = (reply.message || "").split("\n")[0] || "";
  return Array.from(new Set([
    ...tokenize(reply.shortcode),
    ...tokenize(firstLine)
  ])).slice(0, 8);
};

const computeResponseMatchScore = (
  reply: RelevantQuickReply,
  responseText: string
): number => {
  const normalizedResponse = normalize(responseText);
  if (!normalizedResponse) return 0;

  const normalizedShortcode = normalize(reply.shortcode);
  let score = normalizedShortcode && normalizedResponse.includes(normalizedShortcode) ? 0.7 : 0;

  const terms = extractStrongTerms(reply);
  const matchedTerms = terms.filter(term => normalizedResponse.includes(term)).length;
  score += Math.min(0.3, matchedTerms * 0.15);

  return Math.min(1, score);
};

const dedupeCandidates = (candidates: RelevantQuickReply[]): RelevantQuickReply[] => {
  const byId = new Map<number, RelevantQuickReply>();

  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.similarity > existing.similarity) {
      byId.set(candidate.id, candidate);
    }
  }

  return Array.from(byId.values());
};

const planLookup = (input: QuickReplyLookupContext): QuickReplyLookupPlan => {
  const { currentMessage, enrichedQuery, ticketHistory = [], ticketMemory } = input;
  const lastAssistant = getLastAssistantMessage(ticketHistory);
  const shortAnswer = isShortSlotAnswer(currentMessage);
  const qualificationTurn = shortAnswer && isQualificationTurn(lastAssistant);

  if (qualificationTurn) {
    return {
      searchQuery: dedupeParts([
        enrichedQuery || currentMessage,
        currentMessage,
        ticketMemory?.activeTopic || ""
      ]),
      allowPromptContext: false,
      reason: "slot_answer_to_qualification"
    };
  }

  return {
    searchQuery: dedupeParts([
      enrichedQuery || currentMessage,
      currentMessage,
      shortAnswer ? lastAssistant : "",
      ticketMemory?.activeTopic || ""
    ]),
    allowPromptContext: true,
    reason: shortAnswer ? "short_answer_with_context" : "standard_lookup"
  };
};

const buildPostResponseLookupQuery = (params: {
  currentMessage: string;
  finalResponse: string;
  ticketMemory?: CurrentTicketMemory | null;
}): string => {
  const { currentMessage, finalResponse, ticketMemory } = params;
  return dedupeParts([
    finalResponse,
    currentMessage,
    ticketMemory?.activeTopic || ""
  ]);
};

const decideSend = (params: {
  currentMessage: string;
  finalResponse: string;
  intent?: string;
  ticketHistory?: HistoryLine[];
  candidates: RelevantQuickReply[];
}): QuickReplySendDecision => {
  const {
    currentMessage,
    finalResponse,
    intent,
    ticketHistory = [],
    candidates
  } = params;

  if (!finalResponse || !finalResponse.trim()) {
    return { shouldSend: false, reason: "empty_response" };
  }

  if (intent && BLOCKED_INTENTS.has(intent)) {
    return { shouldSend: false, reason: `blocked_intent:${intent}` };
  }

  const mediaCandidates = dedupeCandidates(
    candidates.filter(candidate => candidate.mediaPath)
  );

  if (mediaCandidates.length === 0) {
    return { shouldSend: false, reason: "no_media_candidates" };
  }

  const lastAssistant = getLastAssistantMessage(ticketHistory);
  const shortAnswer = isShortSlotAnswer(currentMessage);
  const slotAnswerToQualification = shortAnswer && isQualificationTurn(lastAssistant);
  const responseKeepsQualifying = isQualificationTurn(finalResponse);
  const recommendationCue = hasRecommendationCue(finalResponse);

  const ranked = mediaCandidates
    .map(candidate => {
      const responseMatch = computeResponseMatchScore(candidate, finalResponse);
      const finalScore = (responseMatch * 0.7) + (candidate.similarity * 0.3);
      return { candidate, responseMatch, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const best = ranked[0];
  const second = ranked[1];

  if (!best) {
    return { shouldSend: false, reason: "ranking_empty" };
  }

  const explicitMention = best.responseMatch >= 0.7;
  const contextualMention = best.responseMatch >= 0.3;
  const ambiguous =
    !!second &&
    Math.abs(best.finalScore - second.finalScore) < 0.08 &&
    !explicitMention;

  if (ambiguous) {
    return { shouldSend: false, reason: "ambiguous_candidates" };
  }

  if (slotAnswerToQualification && !explicitMention && !recommendationCue) {
    return { shouldSend: false, reason: "slot_answer_without_recommendation" };
  }

  if (responseKeepsQualifying && !explicitMention) {
    return { shouldSend: false, reason: "agent_still_qualifying" };
  }

  if (explicitMention && best.candidate.similarity >= 0.45) {
    return {
      shouldSend: true,
      candidate: best.candidate,
      reason: "explicit_product_mention"
    };
  }

  if (recommendationCue && contextualMention && best.candidate.similarity >= 0.5) {
    return {
      shouldSend: true,
      candidate: best.candidate,
      reason: "recommended_with_context_match"
    };
  }

  return {
    shouldSend: false,
    reason: "no_confident_contextual_match"
  };
};

export default {
  planLookup,
  buildPostResponseLookupQuery,
  decideSend
};
