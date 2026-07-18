/**
 * QAExtractorService — Promueve buenos turnos a AIHistoricalQA
 *
 * Se llama DESPUÉS del envío aprobado por el gatekeeper. Evalúa si el par
 * (pregunta_cliente, respuesta_agente) merece persistirse como QA histórica
 * cross-ticket reutilizable.
 *
 * Criterios de promoción:
 *   - la respuesta fue aprobada por gatekeeper='send' o 'rewrite' (no ignore/escalate)
 *   - confianza ≥ 0.55
 *   - longitud razonable (pregunta ≥ 3 palabras, respuesta ≥ 20 chars)
 *   - el agente usado es sales/support/rag (no self/router/escalation)
 *   - intent conocido (no "general" salvo casos factuales claros)
 *
 * answerType:
 *   - "kb_backed" si el agente fue 'rag' y hay fuentes
 *   - "tool_backed" si hay tools invocadas que justifican la respuesta
 *   - "ai_verified" por defecto (pasó gatekeeper)
 *   - "human" reservado para correcciones futuras
 *
 * verified:
 *   - false por defecto en promoción automática. Se marca true cuando el
 *     FeedbackInferenceJob detecta feedbackImplicit='positive' o un humano
 *     corrige y aprueba (no rompemos el flujo existente — solo marcamos).
 *
 * Idempotencia: no creamos duplicados exactos. Antes de insertar, buscamos
 * si ya existe una fila con misma companyId + normalizedQuestion ≥ 0.9 sim.
 */
import HistoricalQARetrieverService from "./HistoricalQARetrieverService";
import CurrentTicketMemoryService from "./CurrentTicketMemoryService";
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

const PREFIX = "[QAExtractor]";

export interface ExtractOptions {
  companyId: number;
  ticketId?: number;
  messageId?: number;
  contactId?: number;
  agentLogId?: number;
  userMessage: string;
  agentAnswer: string;
  confidence: number;
  agentUsed: string;
  intent?: string;
  sources?: Array<{ title: string; relevance: number }>;
  toolsUsed?: string[];
  gatekeeperDecision: "send" | "rewrite" | "escalate" | "ignore";
  language?: string;
  channel?: string;
  // hints de metadata
  productKey?: string;
  tags?: string[];
}

const QUALITY = {
  minConfidence: 0.55,
  minQuestionWords: 3,
  minAnswerChars: 20
};

/** Detecta answerType según señales disponibles */
const detectAnswerType = (
  opts: ExtractOptions
): "human" | "ai_verified" | "kb_backed" | "tool_backed" => {
  if (opts.agentUsed === "rag" && opts.sources && opts.sources.length > 0) return "kb_backed";
  if (opts.toolsUsed && opts.toolsUsed.length > 0) return "tool_backed";
  return "ai_verified";
};

/** Descarta de plano casos no promocionables */
const isEligible = (opts: ExtractOptions): { ok: boolean; reason?: string } => {
  if (opts.gatekeeperDecision === "ignore" || opts.gatekeeperDecision === "escalate") {
    return { ok: false, reason: `gatekeeper=${opts.gatekeeperDecision}` };
  }
  if (!opts.userMessage || !opts.agentAnswer) return { ok: false, reason: "campos vacíos" };
  const words = (opts.userMessage || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < QUALITY.minQuestionWords) return { ok: false, reason: "pregunta muy corta" };
  if ((opts.agentAnswer || "").trim().length < QUALITY.minAnswerChars) return { ok: false, reason: "respuesta muy corta" };
  if (opts.confidence < QUALITY.minConfidence) return { ok: false, reason: `confidence<${QUALITY.minConfidence}` };

  // Agentes válidos
  if (["router", "self", "escalation", "sentiment_escalation", "error_handler"].includes(opts.agentUsed)) {
    return { ok: false, reason: `agentUsed=${opts.agentUsed}` };
  }

  // Intents excluidos (ruido)
  if (opts.intent && ["greeting", "farewell", "escalation"].includes(opts.intent)) {
    return { ok: false, reason: `intent=${opts.intent}` };
  }

  return { ok: true };
};

/** Busca si ya existe un QA muy similar (para no duplicar) */
const findDuplicate = async (
  companyId: number,
  normalizedQuestion: string
): Promise<number | null> => {
  try {
    const rows = await sequelize.query<{ id: number; s: number }>(
      `SELECT id, similarity("normalizedQuestion", :q) AS s
         FROM "AIHistoricalQA"
        WHERE "companyId" = :companyId
          AND superseded = false
          AND similarity("normalizedQuestion", :q) >= 0.9
        ORDER BY s DESC
        LIMIT 1`,
      {
        replacements: { companyId, q: normalizedQuestion },
        type: QueryTypes.SELECT
      }
    );
    return rows[0]?.id || null;
  } catch (e: any) {
    logger.warn(`${PREFIX} findDuplicate falló: ${e.message}`);
    return null;
  }
};

/**
 * Extrae y persiste si cumple criterios. NO bloquea el flujo del supervisor
 * — se llama "fire-and-forget". Nunca lanza.
 */
const extractAndStore = async (opts: ExtractOptions): Promise<number | null> => {
  try {
    const elig = isEligible(opts);
    if (!elig.ok) {
      logger.debug(`${PREFIX} skip: ${elig.reason}`);
      return null;
    }

    const normalized = CurrentTicketMemoryService.normalizeQuestion(opts.userMessage);
    const dup = await findDuplicate(opts.companyId, normalized);
    if (dup) {
      // Incrementar usedCount del ya existente en vez de crear nuevo
      await HistoricalQARetrieverService.markUsed(dup);
      logger.info(`${PREFIX} duplicado detectado (id=${dup}) — usedCount++ en vez de insertar`);
      return dup;
    }

    const answerType = detectAnswerType(opts);
    const tags = opts.tags && opts.tags.length
      ? opts.tags
      : (opts.intent ? [opts.intent] : []);

    const id = await HistoricalQARetrieverService.insert({
      companyId: opts.companyId,
      sourceTicketId: opts.ticketId,
      sourceMessageId: opts.messageId,
      sourceContactId: opts.contactId,
      sourceAgentLogId: opts.agentLogId,
      question: opts.userMessage.slice(0, 2000),
      answer: opts.agentAnswer.slice(0, 8000),
      answerType,
      intent: opts.intent,
      language: opts.language || "es",
      channel: opts.channel,
      tags,
      productKey: opts.productKey,
      verified: false, // se eleva por FeedbackInferenceJob cuando haya señal positiva
      rating: undefined,
      metadata: {
        gatekeeperDecision: opts.gatekeeperDecision,
        confidence: opts.confidence,
        sources: (opts.sources || []).map(s => s.title).slice(0, 5),
        toolsUsed: (opts.toolsUsed || []).slice(0, 8),
        agentUsed: opts.agentUsed
      }
    });

    if (id) logger.info(`${PREFIX} promovida id=${id} company=${opts.companyId} type=${answerType}`);
    return id;
  } catch (e: any) {
    logger.warn(`${PREFIX} extractAndStore falló (silenciado): ${e.message}`);
    return null;
  }
};

/**
 * Marca como verified=true + actualiza rating, llamado cuando
 * FeedbackInferenceJob detecta feedbackImplicit='positive'.
 * No existe acoplamiento duro con el job — es opt-in por sourceAgentLogId.
 */
const markVerifiedByAgentLog = async (
  agentLogId: number,
  rating?: number
): Promise<void> => {
  try {
    await sequelize.query(
      `UPDATE "AIHistoricalQA"
          SET verified = true,
              rating = COALESCE(:rating, rating)
        WHERE "sourceAgentLogId" = :agentLogId
          AND superseded = false`,
      {
        replacements: { agentLogId, rating: rating ?? null },
        type: QueryTypes.UPDATE
      }
    );
  } catch (e: any) {
    logger.warn(`${PREFIX} markVerifiedByAgentLog falló: ${e.message}`);
  }
};

export default {
  extractAndStore,
  markVerifiedByAgentLog
};
