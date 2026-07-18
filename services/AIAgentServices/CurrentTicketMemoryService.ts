/**
 * CurrentTicketMemoryService — Memoria estructurada del ticket en curso
 *
 * Propósito
 * ---------
 * Guardar por ticket qué se respondió, a qué pregunta, con qué fuente y con
 * qué confianza, sin depender de inyectar los últimos 20 mensajes crudos al
 * prompt. Permite al planner/gatekeeper detectar:
 *   - preguntas ya resueltas (answeredFacts)
 *   - preguntas que quedaron sin responder (unresolvedQuestions)
 *   - contradicciones entre turnos
 *   - fallos acumulados del agente (para escalación contextual)
 *
 * Backend
 * -------
 * Redis (mismo patrón que AppointmentContextStore) con fallback a memoria.
 * No es PII sensible — solo resumen operativo — y se renueva con cada turno.
 *
 * Ciclo de vida
 * -------------
 * - load(ticketId)                 → al inicio de cada turno
 * - recordTurn({..., answered})    → tras ResponseGatekeeper='send'/'rewrite'
 * - markUnresolved(question)       → si gatekeeper='escalate' o handoff
 * - clear(ticketId)                → al cerrar ticket
 *
 * Interfaz compatible con lo pedido en el prompt del usuario:
 *   activeTopic / activeIntent / answeredFacts / unresolvedQuestions /
 *   lastUserEmotion / lastResolvedAnswerId / entities / lastAgent /
 *   resolution status
 */
import { REDIS_URI_CONNECTION } from "../../config/redis";
import logger from "../../utils/logger";
import crypto from "crypto";

const PREFIX = "[CurrentTicketMemory]";
const KEY_PREFIX = "ai:convstate:";
const TTL_SECONDS = 60 * 60 * 24; // 24h sliding

export type AnsweredFactSource =
  | "agent" | "human" | "kb" | "tool" | "historical_qa" | "current_ticket";

export interface AnsweredFact {
  id: string;
  key: string;           // slug corto derivado de la pregunta
  question: string;      // pregunta normalizada
  answer: string;        // respuesta dada
  source: AnsweredFactSource;
  confidence: number;
  turnId: number;        // índice secuencial del turno
  agentUsed: string;
  intent?: string;
  timestamp: string;
  // Si la respuesta vino de una fila AIHistoricalQA reusada
  historicalQaId?: number;
}

export interface UnresolvedQuestion {
  question: string;
  turnId: number;
  timestamp: string;
  reason?: string;
}

export interface RecentTurnSnapshot {
  turnId: number;
  userMessage: string;
  agentAnswer: string;
  source: AnsweredFactSource;
  confidence: number;
  resolved: boolean;
  timestamp: string;
}

export interface ConversationSummary {
  currentGoal?: string;
  latestCustomerNeed?: string;
  whatHasBeenAnswered: string[];
  openLoops: string[];
  decisionsMade: string[];
  keyEntities: string[];
  responseStyleHint?: string;
  lastUpdatedAt: string;
}

export interface CurrentTicketMemory {
  ticketId: number;
  companyId: number;
  contactId?: number;
  activeTopic?: string;
  activeIntent?: string;
  answeredFacts: AnsweredFact[];
  unresolvedQuestions: UnresolvedQuestion[];
  entities: Record<string, string>;
  lastUserEmotion?: string;
  emotionalTrajectory: string[];              // últimos 5
  consecutiveLowConfidence: number;
  agentFailures: number;
  lastAgent?: string;
  lastResolvedAnswerId?: string;
  lastTurnStatus?: "resolved" | "unresolved" | "handoff_pending";
  turnCounter: number;
  recentTurns: RecentTurnSnapshot[];
  recentConversationSummary?: ConversationSummary;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── RING BUFFERS ─────────────────────────

const MAX_ANSWERED_FACTS = 30;         // suficiente para un ticket largo
const MAX_UNRESOLVED = 10;
const MAX_EMOTIONAL_TRAJECTORY = 5;
const MAX_RECENT_TURNS = 6;

// ───────────────────────── TEXT HELPERS ──────────────────────────

const STOPWORDS = new Set<string>([
  "el","la","los","las","de","del","en","a","y","o","u","un","una","unos","unas",
  "que","como","cuando","cuanto","cuantos","cuanta","cuantas","quien","quienes",
  "por","para","con","sin","tiene","tienen","hay","es","son","eso","esto","esa",
  "este","esas","esos","si","no","al","pero","ya","me","mi","tu","te","se","lo",
  "les","mas","más","muy","solo","sólo"
]);

const slugify = (s: string, max = 48): string => {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w))
    .slice(0, 6)
    .join("_")
    .slice(0, max) || "general";
};

export const normalizeQuestion = (q: string): string => {
  return (q || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"'`]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
};

const NOISE_PATTERNS: RegExp[] = [
  /^(ok|okay|oki|dale|listo|perfecto|entendido|gracias|muchas gracias|genial|excelente)$/i,
  /^[👍👌🙏🙂😉]+$/
];

const isMeaningfulConversationText = (text?: string): boolean => {
  const value = (text || "").trim();
  if (!value) return false;
  if (value.length < 3) return false;
  return !NOISE_PATTERNS.some(pattern => pattern.test(value));
};

const dedupeSummaryLines = (values: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = (raw || "").trim();
    if (!value) continue;
    const normalized = normalizeQuestion(value) || value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(value);
  }

  return output;
};

const summarizeAnsweredFact = (fact: AnsweredFact): string => {
  const topic = fact.key && fact.key !== "general"
    ? fact.key.replace(/_/g, " ")
    : fact.question;
  return `${truncate(topic, 48)} -> ${truncate(fact.answer, 120)}`;
};

const buildResponseStyleHint = (emotion?: string): string | undefined => {
  switch ((emotion || "").toLowerCase()) {
    case "confused":
      return "Explica simple, en pasos cortos y sin jerga.";
    case "curious":
      return "Mantén una respuesta concreta y añade un ejemplo útil si aplica.";
    case "frustrated":
      return "Responde breve, consistente con lo ya dicho y evita repetir párrafos.";
    case "angry":
      return "Desescala, ve al punto y prioriza una salida operativa clara.";
    default:
      return undefined;
  }
};

const rebuildConversationSummary = (
  mem: CurrentTicketMemory,
  latestCustomerNeed?: string
): ConversationSummary => {
  const lastMeaningfulNeed =
    [latestCustomerNeed, ...mem.recentTurns.map(turn => turn.userMessage).reverse()]
      .find(isMeaningfulConversationText) || mem.unresolvedQuestions.slice(-1)[0]?.question;

  const currentGoal = mem.unresolvedQuestions.length > 0
    ? truncate(mem.unresolvedQuestions[mem.unresolvedQuestions.length - 1].question, 140)
    : lastMeaningfulNeed
      ? truncate(lastMeaningfulNeed, 140)
      : mem.activeIntent;

  const whatHasBeenAnswered = dedupeSummaryLines(
    mem.answeredFacts.slice(-3).map(summarizeAnsweredFact)
  ).slice(-3);

  const openLoops = dedupeSummaryLines(
    mem.unresolvedQuestions.slice(-3).map(item => truncate(item.question, 140))
  ).slice(-3);

  const decisionsMade = dedupeSummaryLines(
    mem.recentTurns
      .slice(-3)
      .filter(turn => turn.resolved && isMeaningfulConversationText(turn.agentAnswer))
      .map(turn => truncate(turn.agentAnswer, 140))
  ).slice(-2);

  const keyEntities = dedupeSummaryLines(
    Object.entries(mem.entities || {})
      .filter(([, value]) => isMeaningfulConversationText(String(value)))
      .slice(-4)
      .map(([key, value]) => `${key}: ${truncate(String(value), 60)}`)
  ).slice(-4);

  return {
    currentGoal,
    latestCustomerNeed: lastMeaningfulNeed ? truncate(lastMeaningfulNeed, 140) : undefined,
    whatHasBeenAnswered,
    openLoops,
    decisionsMade,
    keyEntities,
    responseStyleHint: buildResponseStyleHint(mem.lastUserEmotion),
    lastUpdatedAt: new Date().toISOString()
  };
};

// ───────────────────────── STORE ─────────────────────────────────

class Store {
  private redis: any = null;
  private mem = new Map<string, CurrentTicketMemory>();
  private useRedis = false;

  constructor() { void this.init(); }

  private async init() {
    if (!REDIS_URI_CONNECTION) {
      logger.info(`${PREFIX} Redis no configurado — usando memoria local`);
      return;
    }
    try {
      const { createClient } = await import("redis");
      const hasPwd = REDIS_URI_CONNECTION.includes("@");
      this.redis = createClient({
        url: REDIS_URI_CONNECTION,
        ...(hasPwd ? {} : { socket: { reconnectStrategy: false } })
      });
      this.redis.on("error", (err: any) => {
        if (err.message?.includes("AUTH")) {
          this.useRedis = false;
          return;
        }
        logger.warn(`${PREFIX} redis error: ${err.message}`);
      });
      await this.redis.connect();
      this.useRedis = true;
      logger.info(`${PREFIX} conectado a Redis`);
    } catch (e: any) {
      this.useRedis = false;
      if (!/AUTH|no password/i.test(e.message || "")) {
        logger.warn(`${PREFIX} no pude conectar a Redis: ${e.message} — fallback memoria`);
      }
    }
  }

  private key(companyId: number, ticketId: number) {
    return `${KEY_PREFIX}${companyId}:${ticketId}`;
  }

  async getRaw(ticketId: number, companyId: number): Promise<CurrentTicketMemory | null> {
    if (this.useRedis && this.redis) {
      try {
        const data = await this.redis.get(this.key(companyId, ticketId));
        return data ? (JSON.parse(data) as CurrentTicketMemory) : null;
      } catch (e: any) {
        logger.warn(`${PREFIX} fallback memoria por error redis: ${e.message}`);
        return this.mem.get(this.key(companyId, ticketId)) || null;
      }
    }
    return this.mem.get(this.key(companyId, ticketId)) || null;
  }

  async setRaw(mem: CurrentTicketMemory): Promise<void> {
    mem.updatedAt = new Date().toISOString();
    if (this.useRedis && this.redis) {
      try {
        await this.redis.setEx(this.key(mem.companyId, mem.ticketId), TTL_SECONDS, JSON.stringify(mem));
        return;
      } catch (e: any) {
        logger.warn(`${PREFIX} fallback memoria al escribir: ${e.message}`);
      }
    }
    this.mem.set(this.key(mem.companyId, mem.ticketId), mem);
  }

  async delRaw(ticketId: number, companyId: number): Promise<void> {
    if (this.useRedis && this.redis) {
      try { await this.redis.del(this.key(companyId, ticketId)); } catch { /* noop */ }
    }
    this.mem.delete(this.key(companyId, ticketId));
  }
}

const store = new Store();

// ───────────────────── API PÚBLICA ───────────────────────────────

const empty = (ticketId: number, companyId: number, contactId?: number): CurrentTicketMemory => ({
  ticketId,
  companyId,
  contactId,
  answeredFacts: [],
  unresolvedQuestions: [],
  entities: {},
  emotionalTrajectory: [],
  consecutiveLowConfidence: 0,
  agentFailures: 0,
  turnCounter: 0,
  recentTurns: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

/**
 * Carga (o inicializa) la memoria del ticket.
 */
const load = async (
  ticketId: number,
  companyId: number,
  contactId?: number
): Promise<CurrentTicketMemory> => {
  if (!ticketId) return empty(0, companyId, contactId);
  const existing = await store.getRaw(ticketId, companyId);
  if (existing) {
    return {
      ...empty(ticketId, companyId, contactId),
      ...existing,
      companyId,
      contactId: existing.contactId || contactId,
      answeredFacts: existing.answeredFacts || [],
      unresolvedQuestions: existing.unresolvedQuestions || [],
      entities: existing.entities || {},
      emotionalTrajectory: existing.emotionalTrajectory || [],
      recentTurns: existing.recentTurns || []
    };
  }
  const mem = empty(ticketId, companyId, contactId);
  await store.setRaw(mem);
  return mem;
};

/**
 * Busca un hecho ya respondido que coincida con la pregunta actual.
 * Match lexical por solapamiento de tokens. Retorna el mejor con score ≥ threshold.
 */
const findAnsweredFact = (
  mem: CurrentTicketMemory,
  question: string,
  minOverlap = 0.55
): { fact: AnsweredFact; score: number } | null => {
  if (!question || !mem.answeredFacts.length) return null;

  const qTokens = new Set(normalizeQuestion(question).split(/\s+/).filter(Boolean));
  if (qTokens.size === 0) return null;

  let best: { fact: AnsweredFact; score: number } | null = null;
  for (const f of mem.answeredFacts) {
    const fTokens = new Set(normalizeQuestion(f.question).split(/\s+/).filter(Boolean));
    if (fTokens.size === 0) continue;

    const inter = [...qTokens].filter(t => fTokens.has(t)).length;
    const union = new Set([...qTokens, ...fTokens]).size;
    const score = union > 0 ? inter / union : 0;

    if (score >= minOverlap && (!best || score > best.score)) {
      best = { fact: f, score };
    }
  }
  return best;
};

/**
 * Registra un turno completo tras aprobación del gatekeeper.
 * No falla nunca — los errores se silencian; la memoria es mejor-esfuerzo.
 */
const recordTurn = async (params: {
  ticketId: number;
  companyId: number;
  contactId?: number;
  userMessage: string;
  agentAnswer: string;
  source: AnsweredFactSource;
  confidence: number;
  agentUsed: string;
  intent?: string;
  emotion?: string;
  turnResolved: boolean;      // true si el gatekeeper permitió 'send' con buena confianza
  historicalQaId?: number;
  entities?: Record<string, string>;
}): Promise<AnsweredFact | null> => {
  try {
    if (!params.ticketId) return null;

    const mem = await load(params.ticketId, params.companyId, params.contactId);
    mem.turnCounter += 1;

    // Emoción
    if (params.emotion) {
      mem.lastUserEmotion = params.emotion;
      mem.emotionalTrajectory = [
        ...mem.emotionalTrajectory.slice(-(MAX_EMOTIONAL_TRAJECTORY - 1)),
        params.emotion
      ];
    }

    // Entidades (merge)
    if (params.entities) {
      mem.entities = { ...mem.entities, ...params.entities };
    }

    // Confianza / fallos acumulados
    if (params.confidence < 0.35) {
      mem.consecutiveLowConfidence += 1;
    } else {
      mem.consecutiveLowConfidence = 0;
    }

    if (!params.turnResolved) {
      mem.agentFailures += 1;
      mem.lastTurnStatus = "unresolved";
      mem.activeTopic = slugify(params.userMessage).replace(/_/g, " ");
    } else {
      mem.lastTurnStatus = "resolved";
    }

    mem.lastAgent = params.agentUsed;
    mem.activeIntent = params.intent || mem.activeIntent;

    // Guardar snapshot compacto del turno reciente
    mem.recentTurns = [
      ...mem.recentTurns,
      {
        turnId: mem.turnCounter,
        userMessage: params.userMessage,
        agentAnswer: params.agentAnswer,
        source: params.source,
        confidence: params.confidence,
        resolved: params.turnResolved,
        timestamp: new Date().toISOString()
      }
    ].slice(-MAX_RECENT_TURNS);

    // Construir AnsweredFact sólo si el turno realmente respondió
    let fact: AnsweredFact | null = null;
    if (params.turnResolved && params.userMessage && params.agentAnswer) {
      fact = {
        id: crypto.randomBytes(8).toString("hex"),
        key: slugify(params.userMessage),
        question: normalizeQuestion(params.userMessage),
        answer: params.agentAnswer,
        source: params.source,
        confidence: params.confidence,
        turnId: mem.turnCounter,
        agentUsed: params.agentUsed,
        intent: params.intent,
        timestamp: new Date().toISOString(),
        historicalQaId: params.historicalQaId
      };

      mem.answeredFacts = [...mem.answeredFacts, fact].slice(-MAX_ANSWERED_FACTS);
      mem.lastResolvedAnswerId = fact.id;
      mem.activeTopic = fact.key.replace(/_/g, " ");

      // Si la pregunta actual estaba en unresolved, removerla
      mem.unresolvedQuestions = mem.unresolvedQuestions.filter(uq => {
        const u = new Set(normalizeQuestion(uq.question).split(/\s+/));
        const q = new Set(normalizeQuestion(params.userMessage).split(/\s+/));
        const inter = [...u].filter(t => q.has(t)).length;
        const union = new Set([...u, ...q]).size;
        return union === 0 ? true : (inter / union) < 0.55;
      });
    }

    mem.recentConversationSummary = rebuildConversationSummary(mem, params.userMessage);
    await store.setRaw(mem);
    return fact;
  } catch (e: any) {
    logger.warn(`${PREFIX} recordTurn falló (silenciado): ${e.message}`);
    return null;
  }
};

/**
 * Marca una pregunta como NO resuelta (ej: gatekeeper→escalate).
 */
const markUnresolved = async (
  ticketId: number, companyId: number, question: string, reason?: string
): Promise<void> => {
  try {
    if (!ticketId || !question) return;
    const mem = await load(ticketId, companyId);
    mem.unresolvedQuestions = [
      ...mem.unresolvedQuestions,
      {
        question: normalizeQuestion(question),
        turnId: mem.turnCounter + 1,
        timestamp: new Date().toISOString(),
        reason
      }
    ].slice(-MAX_UNRESOLVED);
    mem.lastTurnStatus = "handoff_pending";
    mem.recentConversationSummary = rebuildConversationSummary(mem, question);
    await store.setRaw(mem);
  } catch (e: any) {
    logger.warn(`${PREFIX} markUnresolved falló: ${e.message}`);
  }
};

/**
 * Construye el bloque textual que se inyecta al PromptContextBuilder.
 * Compacto, ordenado y sin mensajes crudos masivos.
 */
const buildSupervisorBlock = async (
  ticketId: number,
  companyId: number,
  currentMessage: string
): Promise<{ block: string; hit?: AnsweredFact; hitScore?: number }> => {
  if (!ticketId) return { block: "" };

  const mem = await store.getRaw(ticketId, companyId);
  if (!mem) return { block: "" };
  const summary = mem.recentConversationSummary ||
    ((mem.answeredFacts.length > 0 || mem.unresolvedQuestions.length > 0 || mem.recentTurns.length > 0)
      ? rebuildConversationSummary(mem)
      : undefined);

  const lines: string[] = [`## 🧠 MEMORIA ESTRUCTURADA DEL TICKET (turno #${mem.turnCounter})`];

  if (mem.activeTopic) lines.push(`**Tema activo:** ${mem.activeTopic}`);
  if (mem.activeIntent) lines.push(`**Intent activo:** ${mem.activeIntent}`);
  if (mem.lastUserEmotion) lines.push(`**Emoción última:** ${mem.lastUserEmotion}`);
  if (summary) {
    lines.push(`**Resumen operativo reciente:**`);
    if (summary.currentGoal) {
      lines.push(`- Objetivo actual: ${summary.currentGoal}`);
    }
    if (summary.latestCustomerNeed) {
      lines.push(`- Último pedido del cliente: ${summary.latestCustomerNeed}`);
    }
    summary.whatHasBeenAnswered.forEach(item => {
      lines.push(`- Ya respondido: ${item}`);
    });
    summary.openLoops.forEach(item => {
      lines.push(`- Pendiente: ${item}`);
    });
    summary.decisionsMade.forEach(item => {
      lines.push(`- Última decisión útil: ${item}`);
    });
    summary.keyEntities.forEach(item => {
      lines.push(`- Dato clave: ${item}`);
    });
    if (summary.responseStyleHint) {
      lines.push(`- Cómo responder ahora: ${summary.responseStyleHint}`);
    }
  }

  // Hit directo
  const match = findAnsweredFact(mem, currentMessage, 0.55);
  if (match) {
    lines.push(
      `**⚠️ Pregunta ya respondida en este ticket** (turno #${match.fact.turnId}, ` +
      `fuente=${match.fact.source}, conf=${match.fact.confidence.toFixed(2)}):`,
      `> ${match.fact.answer}`,
      `*Si vuelves a responder, DEBE SER CONSISTENTE con la respuesta anterior. ` +
      `No contradigas ni reformules de forma distinta. Si el cliente insiste, resume y confirma.*`
    );
  }

  if (mem.answeredFacts.length && !match) {
    lines.push(`**Hechos ya respondidos (últimos ${Math.min(mem.answeredFacts.length, 5)}):**`);
    mem.answeredFacts.slice(-5).forEach(f => {
      lines.push(`- [${f.source}] ${f.question} → ${truncate(f.answer, 140)}`);
    });
  }

  if (mem.unresolvedQuestions.length) {
    lines.push(`**Preguntas sin resolver pendientes:**`);
    mem.unresolvedQuestions.slice(-3).forEach(q => {
      lines.push(`- ${q.question}${q.reason ? ` (motivo: ${q.reason})` : ""}`);
    });
  }

  if (mem.agentFailures >= 2) {
    lines.push(
      `**⚠️ Señal operativa:** el bot ya falló ${mem.agentFailures} turnos seguidos. ` +
      `Si no puedes resolver con la memoria actual, ofrece escalar a un asesor humano.`
    );
  }

  return {
    block: lines.join("\n"),
    hit: match?.fact,
    hitScore: match?.score
  };
};

/**
 * Elimina la memoria de un ticket (llamar al cerrarlo).
 */
const clear = async (ticketId: number, companyId: number): Promise<void> => {
  await store.delRaw(ticketId, companyId);
};

// ─────────────────────── utilidades ─────────────────────────────

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.substring(0, max) + "...";
}

export default {
  load,
  recordTurn,
  markUnresolved,
  buildSupervisorBlock,
  findAnsweredFact,
  clear,
  normalizeQuestion
};
