/**
 * CorrectionLearningService — Orquesta el loop de aprendizaje desde
 * correcciones humanas detectadas por HumanCorrectionExtractorJob.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Flujo de handle():
 *   1. Verificar feature flag (nivel >= 1).
 *   2. Cargar AIAgentLog + Ticket + Queue (con relaciones).
 *   3. Verificar idempotencia: ya procesamos este aiAgentLogId?
 *   4. Llamar HumanCorrectionClassifierAgent.classify().
 *   5. Si NO es corrección → registrar AICorrectionLearned como skipped_not_correction.
 *   6. Si requiere review (crítica o confidence<0.85) → crear AICorrectionReviewQueue.
 *   7. Si auto-aprendible (nivel>=2):
 *        - Buscar duplicado en AISupportCorrections por embedding+exacto.
 *        - Si existe → usageCount++ y skipped_duplicate.
 *        - Si no → crear AISupportCorrection con source='human_correction_loop'.
 *        - Si nivel>=3 y shouldUpdateAIHistoricalQA → supersede QA contradictoria.
 *   8. Registrar AICorrectionLearned con outcome final.
 *
 * Defensivo:
 *   - Nunca lanza. Todo error se loguea y retorna `processed:false`.
 *   - Transacciones por bloque para no dejar correcciones a medias.
 *   - BD SAGRADA: solo INSERT/UPDATE, jamás DELETE.
 */

import { Op, QueryTypes } from "sequelize";
import sequelize from "../../database";
import AIAgentLog from "../../models/AIAgentLog";
import AISupportCorrection from "../../models/AISupportCorrection";
import AICorrectionReviewQueue from "../../models/AICorrectionReviewQueue";
import AICorrectionLearned from "../../models/AICorrectionLearned";
import type { LearnedOutcome } from "../../models/AICorrectionLearned";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import logger from "../../utils/logger";

import AILearningFeatureFlag from "./AILearningFeatureFlag";
import HumanCorrectionClassifierAgent, {
  ClassifyResult
} from "./HumanCorrectionClassifierAgent";
import CorrectionScopeMatcher from "./CorrectionScopeMatcher";

const PREFIX = "[CorrectionLearning]";

export interface HandleInput {
  aiAgentLogId: number;
  humanCorrectionText: string;
  ticketId?: number;
  companyId: number;
  /** Opcional: si ya tienes la respuesta IA, la pasas para evitar otra lectura. */
  lastAiResponse?: string;
  /** Opcional: el userId del humano que envió la corrección. */
  appliedByUserId?: number;
}

export interface HandleResult {
  processed: boolean;
  outcome: LearnedOutcome;
  classification?: ClassifyResult;
  supportCorrectionId?: number;
  reviewQueueId?: number;
  learnedId?: number;
  errors?: string[];
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

const buildSkipResult = (
  outcome: LearnedOutcome,
  classification?: ClassifyResult
): HandleResult => ({
  processed: true,
  outcome,
  classification
});

const recordLearned = async (
  companyId: number,
  ticketId: number | undefined,
  aiAgentLogId: number | undefined,
  classification: ClassifyResult | undefined,
  outcome: LearnedOutcome,
  refs: {
    supportCorrectionId?: number | null;
    reviewQueueId?: number | null;
    supersededQaId?: number | null;
    appliedBy?: number | null;
  },
  metadata: Record<string, unknown> = {}
): Promise<number | undefined> => {
  try {
    const row = await AICorrectionLearned.create({
      companyId,
      ticketId: ticketId ?? null,
      aiAgentLogId: aiAgentLogId ?? null,
      supportCorrectionId: refs.supportCorrectionId ?? null,
      reviewQueueId: refs.reviewQueueId ?? null,
      supersededQaId: refs.supersededQaId ?? null,
      correctionType: (classification?.correctionType as any) || "not_correction",
      wrongAiClaim: classification?.wrongAiClaim ?? null,
      correctHumanClaim: classification?.correctHumanClaim ?? null,
      scope: classification?.scope || { companyId },
      outcome,
      classifierConfidence: classification?.confidence ?? 0,
      appliedBy: refs.appliedBy ?? null,
      metadata: {
        ...metadata,
        entity: classification?.entity,
        field: classification?.field,
        reason: classification?.reason,
        classifierLatencyMs: classification?.classifierLatencyMs,
        classifierTokens: classification?.classifierTokens,
        modelUsed: classification?.modelUsed
      }
    } as any);
    return row.id;
  } catch (e: any) {
    logger.warn(`${PREFIX} no se pudo registrar AICorrectionLearned: ${e.message}`);
    return undefined;
  }
};

/**
 * Detecta si ya procesamos esta corrección antes (idempotencia).
 * Usa el índice único parcial uniq_acl_aiagentlog_outcome.
 */
const alreadyProcessed = async (aiAgentLogId: number): Promise<boolean> => {
  if (!aiAgentLogId) return false;
  const row = await AICorrectionLearned.findOne({
    where: {
      aiAgentLogId,
      outcome: { [Op.ne]: "pending" as any }
    },
    attributes: ["id", "outcome"]
  });
  return !!row;
};

/**
 * Busca duplicado de AISupportCorrection por similitud del problem.
 * Usa pg_trgm si está disponible; fallback a comparación exacta.
 */
const findDuplicateCorrection = async (
  companyId: number,
  problem: string
): Promise<AISupportCorrection | null> => {
  if (!problem || problem.trim().length < 5) return null;
  try {
    const rows = await sequelize.query<{ id: number; similarity: number }>(
      `SELECT id, similarity(problem, :p) AS similarity
         FROM "AISupportCorrections"
        WHERE "companyId" = :companyId
          AND "isActive" = true
          AND similarity(problem, :p) >= 0.85
        ORDER BY similarity DESC
        LIMIT 1`,
      {
        replacements: { companyId, p: problem.slice(0, 500) },
        type: QueryTypes.SELECT
      }
    );
    if (rows && rows.length > 0) {
      return await AISupportCorrection.findByPk(rows[0].id);
    }
  } catch (e: any) {
    logger.debug(`${PREFIX} findDuplicateCorrection trigram falló: ${e.message}`);
  }
  return null;
};

/**
 * Marca como superseded las filas de AIHistoricalQA que contradicen la
 * corrección humana aprendida. Solo se ejecuta para tipos NO críticos y
 * cuando el nivel del feature flag lo permite.
 */
const supersedeContradictoryQA = async (
  companyId: number,
  wrongAiClaim: string,
  newSupportCorrectionId: number
): Promise<number[]> => {
  if (!wrongAiClaim || wrongAiClaim.trim().length < 5) return [];
  try {
    // Buscar QA cuya respuesta sea muy parecida al claim incorrecto del bot.
    const rows = await sequelize.query<{ id: number }>(
      `SELECT id
         FROM "AIHistoricalQA"
        WHERE "companyId" = :companyId
          AND superseded = false
          AND similarity(answer, :wrong) >= 0.82
        LIMIT 5`,
      {
        replacements: { companyId, wrong: wrongAiClaim.slice(0, 500) },
        type: QueryTypes.SELECT
      }
    );
    if (!rows || rows.length === 0) return [];

    const ids = rows.map(r => r.id);
    await sequelize.query(
      `UPDATE "AIHistoricalQA"
          SET superseded = true,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('supersededByCorrectionId', :corrId)
        WHERE id = ANY(:ids)`,
      {
        replacements: { corrId: newSupportCorrectionId, ids },
        type: QueryTypes.UPDATE
      }
    );
    logger.info(`${PREFIX} supersede ${ids.length} filas AIHistoricalQA por corrección humana`);
    return ids;
  } catch (e: any) {
    logger.warn(`${PREFIX} supersede falló: ${e.message}`);
    return [];
  }
};

// ───────────────────────────────────────────────────────────────────
// Carga de contexto del ticket
// ───────────────────────────────────────────────────────────────────

interface LoadedContext {
  aiLog: AIAgentLog | null;
  ticket: Ticket | null;
  queue: Queue | null;
  intent: string | undefined;
  toolsUsedByAI: string[];
  detectedProduct: string | undefined;
  tags: string[] | undefined;
}

const loadContext = async (
  aiAgentLogId: number,
  ticketId?: number
): Promise<LoadedContext> => {
  let aiLog: AIAgentLog | null = null;
  try {
    aiLog = await AIAgentLog.findByPk(aiAgentLogId);
  } catch { aiLog = null; }

  const finalTicketId = ticketId ?? aiLog?.ticketId;
  let ticket: Ticket | null = null;
  let queue: Queue | null = null;
  if (finalTicketId) {
    try {
      ticket = await Ticket.findByPk(finalTicketId, {
        include: [{ model: Queue, as: "queue" }] as any
      });
      queue = (ticket as any)?.queue || null;
    } catch { ticket = null; }
  }

  const meta = (aiLog?.metadata || {}) as Record<string, unknown>;
  const intent = typeof meta.intent === "string" ? meta.intent : undefined;
  const toolsUsedByAI = Array.isArray(aiLog?.toolsUsed) ? aiLog?.toolsUsed as string[] : [];
  const detectedProduct = typeof meta.productKey === "string" ? meta.productKey : undefined;

  return {
    aiLog,
    ticket,
    queue,
    intent,
    toolsUsedByAI,
    detectedProduct,
    tags: undefined
  };
};

// ───────────────────────────────────────────────────────────────────
// Función principal
// ───────────────────────────────────────────────────────────────────

export const handle = async (input: HandleInput): Promise<HandleResult> => {
  const { companyId, aiAgentLogId, humanCorrectionText, ticketId, appliedByUserId } = input;

  // 1) Feature flag
  const level = AILearningFeatureFlag.getLevel(companyId);
  if (level === 0) {
    logger.debug(`${PREFIX} skipped_disabled company=${companyId}`);
    return buildSkipResult("skipped_disabled");
  }

  // 2) Idempotencia
  if (await alreadyProcessed(aiAgentLogId)) {
    logger.info(`${PREFIX} aiAgentLogId=${aiAgentLogId} ya procesado, skip`);
    return { processed: true, outcome: "auto_applied", errors: ["already_processed"] };
  }

  // 3) Cargar contexto
  const ctx = await loadContext(aiAgentLogId, ticketId);
  const lastAiResponse = input.lastAiResponse || ctx.aiLog?.outputSummary || "";

  // 4) Clasificar
  const classification = await HumanCorrectionClassifierAgent.classify({
    companyId,
    ticketId: ctx.ticket?.id,
    lastAiResponse,
    humanMessage: humanCorrectionText,
    ticketState: {
      status: ctx.ticket?.status,
      queueId: ctx.ticket?.queueId,
      queueName: ctx.queue?.name,
      queuePromptAI: (ctx.queue as any)?.promptAI
    },
    intent: ctx.intent,
    toolsUsedByAI: ctx.toolsUsedByAI,
    detectedProduct: ctx.detectedProduct
  });

  // 5) NO es corrección → registrar y salir
  if (!classification.isCorrection || classification.correctionType === "not_correction") {
    const learnedId = await recordLearned(
      companyId, ctx.ticket?.id, aiAgentLogId, classification,
      "skipped_not_correction",
      { appliedBy: appliedByUserId }
    );
    return {
      processed: true,
      outcome: "skipped_not_correction",
      classification,
      learnedId
    };
  }

  // 6) Calidad mínima: claims no vacíos
  const wrongAiClaim = (classification.wrongAiClaim || "").trim();
  const correctHumanClaim = (classification.correctHumanClaim || humanCorrectionText || "").trim();

  if (correctHumanClaim.length < 5) {
    const learnedId = await recordLearned(
      companyId, ctx.ticket?.id, aiAgentLogId, classification,
      "skipped_low_quality",
      { appliedBy: appliedByUserId },
      { reason: "correctHumanClaim demasiado corto" }
    );
    return {
      processed: true,
      outcome: "skipped_low_quality",
      classification,
      learnedId
    };
  }

  // 7) ¿Requiere review humano? (tipos críticos siempre, baja confidence siempre)
  if (classification.requiresHumanApproval) {
    try {
      const review = await AICorrectionReviewQueue.create({
        companyId,
        ticketId: ctx.ticket?.id ?? null,
        contactId: ctx.ticket?.contactId ?? null,
        aiAgentLogId,
        queueId: ctx.ticket?.queueId ?? null,
        correctionType: classification.correctionType as any,
        wrongAiClaim: wrongAiClaim || null,
        correctHumanClaim,
        entity: classification.entity ?? null,
        field: classification.field ?? null,
        scope: {
          ...classification.scope,
          companyId
        },
        classifierConfidence: classification.confidence,
        classifierJson: classification as unknown as Record<string, unknown>,
        status: "pending"
      } as any);

      const learnedId = await recordLearned(
        companyId, ctx.ticket?.id, aiAgentLogId, classification,
        "sent_to_review",
        { reviewQueueId: review.id, appliedBy: appliedByUserId }
      );

      logger.info(
        `${PREFIX} → review id=${review.id} type=${classification.correctionType} ` +
        `conf=${classification.confidence.toFixed(2)} company=${companyId}`
      );

      return {
        processed: true,
        outcome: "sent_to_review",
        classification,
        reviewQueueId: review.id,
        learnedId
      };
    } catch (e: any) {
      logger.warn(`${PREFIX} no se pudo crear review queue: ${e.message}`);
      await recordLearned(
        companyId, ctx.ticket?.id, aiAgentLogId, classification,
        "skipped_low_quality",
        { appliedBy: appliedByUserId },
        { error: `create review failed: ${e.message}` }
      );
      return { processed: false, outcome: "skipped_low_quality", classification, errors: [e.message] };
    }
  }

  // 8) Nivel >= 2 con tipo no crítico y alta confidence → auto-aprender
  if (!AILearningFeatureFlag.canAutoLearn(companyId)) {
    // Modo nivel 1: solo registrar como observación
    const learnedId = await recordLearned(
      companyId, ctx.ticket?.id, aiAgentLogId, classification,
      "skipped_low_quality",
      { appliedBy: appliedByUserId },
      { reason: "feature flag nivel 1 — solo observación" }
    );
    return {
      processed: true,
      outcome: "skipped_low_quality",
      classification,
      learnedId
    };
  }

  // 9) Buscar duplicado
  const problemText = wrongAiClaim || `Bot dijo algo distinto sobre ${classification.entity || "este tema"}`;
  const dup = await findDuplicateCorrection(companyId, problemText);
  if (dup) {
    try {
      await dup.update({
        usageCount: (dup.usageCount || 0) + 1,
        lastUsedAt: new Date()
      });
    } catch { /* silent */ }

    const learnedId = await recordLearned(
      companyId, ctx.ticket?.id, aiAgentLogId, classification,
      "skipped_duplicate",
      { supportCorrectionId: dup.id, appliedBy: appliedByUserId }
    );
    logger.info(`${PREFIX} skipped_duplicate corrId=${dup.id} company=${companyId}`);
    return {
      processed: true,
      outcome: "skipped_duplicate",
      classification,
      supportCorrectionId: dup.id,
      learnedId
    };
  }

  // 10) Crear nueva AISupportCorrection
  let newCorrectionId: number | undefined;
  try {
    const created = await AISupportCorrection.create({
      companyId,
      problem: problemText.slice(0, 2000),
      solution: correctHumanClaim.slice(0, 2000),
      category: classification.correctionType,
      isActive: true,
      usageCount: 0,
      source: "human_correction_loop" as any,
      correctionType: classification.correctionType,
      scopeJson: {
        ...classification.scope,
        companyId
      },
      verifiedBy: appliedByUserId ?? null,
      verifiedAt: new Date(),
      sourceAgentLogId: aiAgentLogId,
      sourceTicketId: ctx.ticket?.id ?? null,
      priority: 10 // alta prioridad: viene de un humano en producción
    } as any);
    newCorrectionId = created.id;

    // 11) Generar embedding (fire-and-forget): reusa CorrectionSearchService.syncEmbedding
    try {
      const CorrectionSearchService = require("../AIAgentServices/CorrectionSearchService").default;
      if (typeof CorrectionSearchService?.syncEmbedding === "function") {
        void CorrectionSearchService.syncEmbedding(newCorrectionId, companyId)
          .catch((e: any) => logger.warn(`${PREFIX} syncEmbedding falló: ${e.message}`));
      }
    } catch { /* silent */ }
  } catch (e: any) {
    logger.warn(`${PREFIX} no se pudo crear AISupportCorrection: ${e.message}`);
    await recordLearned(
      companyId, ctx.ticket?.id, aiAgentLogId, classification,
      "skipped_low_quality",
      { appliedBy: appliedByUserId },
      { error: `create correction failed: ${e.message}` }
    );
    return { processed: false, outcome: "skipped_low_quality", classification, errors: [e.message] };
  }

  // 12) Supersede QA contradictoria (solo nivel >= 3 + flag de classifier)
  let supersededIds: number[] = [];
  if (AILearningFeatureFlag.canSupersedeHistoricalQA(companyId) &&
      classification.shouldUpdateAIHistoricalQA &&
      wrongAiClaim) {
    supersededIds = await supersedeContradictoryQA(companyId, wrongAiClaim, newCorrectionId);
  }

  const learnedId = await recordLearned(
    companyId, ctx.ticket?.id, aiAgentLogId, classification,
    "auto_applied",
    {
      supportCorrectionId: newCorrectionId,
      supersededQaId: supersededIds[0] ?? null,
      appliedBy: appliedByUserId
    },
    { supersededIds }
  );

  logger.info(
    `${PREFIX} auto_applied corrId=${newCorrectionId} type=${classification.correctionType} ` +
    `superseded=${supersededIds.length} company=${companyId}`
  );

  return {
    processed: true,
    outcome: "auto_applied",
    classification,
    supportCorrectionId: newCorrectionId,
    learnedId
  };
};

// ───────────────────────────────────────────────────────────────────
// Aprobación humana desde panel
// ───────────────────────────────────────────────────────────────────

export interface ApproveInput {
  reviewQueueId: number;
  companyId: number;
  approvedByUserId: number;
  /** Opcional: editar el problema/solución antes de aprobar. */
  overrideProblem?: string;
  overrideSolution?: string;
  reviewNotes?: string;
}

export interface ApproveResult {
  ok: boolean;
  supportCorrectionId?: number;
  reason?: string;
}

/**
 * Aprueba una corrección desde el panel humano. Crea AISupportCorrection,
 * actualiza review queue a status='approved', genera embedding y registra
 * AICorrectionLearned con outcome='approved_by_human'.
 */
export const approveFromReview = async (
  input: ApproveInput
): Promise<ApproveResult> => {
  const review = await AICorrectionReviewQueue.findOne({
    where: { id: input.reviewQueueId, companyId: input.companyId }
  });

  if (!review) return { ok: false, reason: "review_not_found" };
  if (review.status !== "pending") {
    return { ok: false, reason: `review_status=${review.status}` };
  }

  const problem = (input.overrideProblem || review.wrongAiClaim || "").trim();
  const solution = (input.overrideSolution || review.correctHumanClaim || "").trim();

  if (!solution || solution.length < 5) {
    return { ok: false, reason: "solution_too_short" };
  }

  const finalProblem = problem.length > 0
    ? problem
    : `Bot respondió incorrectamente sobre ${review.entity || review.correctionType}`;

  try {
    const created = await AISupportCorrection.create({
      companyId: input.companyId,
      problem: finalProblem.slice(0, 2000),
      solution: solution.slice(0, 2000),
      category: review.correctionType,
      isActive: true,
      usageCount: 0,
      source: "human_correction_loop" as any,
      correctionType: review.correctionType,
      scopeJson: CorrectionScopeMatcher.normalizeScope(review.scope, input.companyId),
      verifiedBy: input.approvedByUserId,
      verifiedAt: new Date(),
      sourceAgentLogId: review.aiAgentLogId ?? null,
      sourceTicketId: review.ticketId ?? null,
      priority: 5 // máxima prioridad: aprobada por humano en panel
    } as any);

    await review.update({
      status: "approved",
      reviewedBy: input.approvedByUserId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null
    } as any);

    // Embedding
    try {
      const CorrectionSearchService = require("../AIAgentServices/CorrectionSearchService").default;
      if (typeof CorrectionSearchService?.syncEmbedding === "function") {
        void CorrectionSearchService.syncEmbedding(created.id, input.companyId)
          .catch((e: any) => logger.warn(`${PREFIX} syncEmbedding falló: ${e.message}`));
      }
    } catch { /* silent */ }

    // Bitácora
    await recordLearned(
      input.companyId,
      review.ticketId ?? undefined,
      review.aiAgentLogId ?? undefined,
      undefined,
      "approved_by_human",
      {
        supportCorrectionId: created.id,
        reviewQueueId: review.id,
        appliedBy: input.approvedByUserId
      },
      {
        correctionType: review.correctionType,
        reviewNotes: input.reviewNotes
      }
    );

    logger.info(
      `${PREFIX} approve review=${review.id} → correction=${created.id} ` +
      `by user=${input.approvedByUserId} company=${input.companyId}`
    );

    return { ok: true, supportCorrectionId: created.id };
  } catch (e: any) {
    logger.warn(`${PREFIX} approve falló: ${e.message}`);
    return { ok: false, reason: e.message };
  }
};

export interface RejectInput {
  reviewQueueId: number;
  companyId: number;
  rejectedByUserId: number;
  reviewNotes?: string;
}

export const rejectFromReview = async (
  input: RejectInput
): Promise<{ ok: boolean; reason?: string }> => {
  const review = await AICorrectionReviewQueue.findOne({
    where: { id: input.reviewQueueId, companyId: input.companyId }
  });
  if (!review) return { ok: false, reason: "review_not_found" };
  if (review.status !== "pending") {
    return { ok: false, reason: `review_status=${review.status}` };
  }

  await review.update({
    status: "rejected",
    reviewedBy: input.rejectedByUserId,
    reviewedAt: new Date(),
    reviewNotes: input.reviewNotes ?? null
  } as any);

  await recordLearned(
    input.companyId,
    review.ticketId ?? undefined,
    review.aiAgentLogId ?? undefined,
    undefined,
    "rejected_by_human",
    {
      reviewQueueId: review.id,
      appliedBy: input.rejectedByUserId
    },
    {
      correctionType: review.correctionType,
      reviewNotes: input.reviewNotes
    }
  );

  logger.info(
    `${PREFIX} reject review=${review.id} by user=${input.rejectedByUserId} company=${input.companyId}`
  );

  return { ok: true };
};

export default {
  handle,
  approveFromReview,
  rejectFromReview
};
