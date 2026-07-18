/**
 * Job: HumanCorrectionExtractorJob
 * Detecta cuando un agente humano reescribe/reemplaza la respuesta de la IA.
 *
 * Flujo legacy (sigue activo, comportamiento NO cambia con AI_LEARNING_LEVEL=0):
 *   1. Se encola cuando un agente humano envía un mensaje en un ticket
 *      donde previamente hubo una respuesta de la IA.
 *   2. Busca el último log de IA para ese ticket sin corrección.
 *   3. Si el mensaje humano llegó dentro de los 2 minutos siguientes a la IA
 *      → marca AIAgentLog.feedbackImplicit='corrected'.
 *   4. Guarda el par {respuesta_ia, respuesta_humana} en AIAgentLog.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje:
 *   Si AILearningFeatureFlag.isEnabled(companyId), tras el flujo legacy se
 *   invoca CorrectionLearningService.handle() para clasificar la corrección
 *   y aprenderla (auto o vía review humano). Fire-and-forget — nunca bloquea
 *   ni rompe el job legacy.
 */

import { Job } from "bull";
import AIAgentLog from "../models/AIAgentLog";
import Message from "../models/Message";
import logger from "../utils/logger";
import AILearningFeatureFlag from "../services/AILearningServices/AILearningFeatureFlag";
import CorrectionLearningService from "../services/AILearningServices/CorrectionLearningService";

interface HumanCorrectionJobData {
  humanMessageId: number;
  ticketId: number;
  companyId: number;
  humanMessageContent: string;
  humanMessageTimestamp: Date;
  /** Opcional: userId del humano que envió el mensaje. */
  humanUserId?: number;
}

const CORRECTION_WINDOW_MS = 2 * 60 * 1000; // 2 minutos

const handle = async (
  job: Job<HumanCorrectionJobData>
): Promise<{ detected: boolean; correctedLogId?: number }> => {
  const {
    humanMessageId, ticketId, companyId,
    humanMessageContent, humanMessageTimestamp
  } = job.data;

  logger.info(
    `[HumanCorrection] Evaluando mensaje humano: ticket=${ticketId}, ` +
    `msgId=${humanMessageId}, content="${humanMessageContent.substring(0, 50)}..."`
  );

  try {
    // Buscar el último log de IA para este ticket que no tenga corrección
    const lastIALog = await AIAgentLog.findOne({
      where: {
        ticketId,
        humanCorrection: null
      },
      order: [["createdAt", "DESC"]],
      limit: 1
    });

    if (!lastIALog) {
      logger.info(`[HumanCorrection] No se encontró log de IA sin corregir para ticket ${ticketId}`);
      return { detected: false };
    }

    // Verificar que el mensaje humano llegó dentro de la ventana de corrección
    const timeDiff = humanMessageTimestamp.getTime() - lastIALog.createdAt.getTime();

    if (timeDiff < 0 || timeDiff > CORRECTION_WINDOW_MS) {
      logger.info(
        `[HumanCorrection] Mensaje humano fuera de ventana (${Math.round(timeDiff / 1000)}s): ` +
        `ticket=${ticketId}, iaLog=${lastIALog.id}`
      );
      return { detected: false };
    }

    // Es una corrección — guardar los datos
    lastIALog.feedbackImplicit = "corrected";
    lastIALog.humanCorrection = humanMessageContent;
    lastIALog.correctionDeltaMs = timeDiff;
    await lastIALog.save();

    // También guardar un log para la corrección humana (hijo del log de IA)
    await AIAgentLog.create({
      companyId,
      ticketId,
      contactId: null,
      agentType: "human_correction",
      modelUsed: "human",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: timeDiff,
      confidence: 1.0,
      wasEscalated: false,
      escalationReason: null,
      cacheHit: false,
      toolsUsed: [],
      inputSummary: `[Corrección] Respuesta IA original: "${(lastIALog.outputSummary || "").substring(0, 100)}"`,
      outputSummary: humanMessageContent.substring(0, 200),
      metadata: {
        originalIALogId: lastIALog.id,
        correctionDeltaMs: timeDiff
      },
      feedbackImplicit: null,
      humanCorrection: null,
      correctionDeltaMs: null,
      parentLogId: lastIALog.id
    } as any);

    logger.info(
      `[HumanCorrection] ✅ Corrección detectada: iaLogId=${lastIALog.id}, ` +
      `correctionMs=${timeDiff}, humanContent="${humanMessageContent.substring(0, 50)}..."`
    );

    // ─── Sprint 1 (2026-05-20) — Loop de Aprendizaje ─────────────────
    // Si el feature flag está activo para esta empresa, invocamos el
    // clasificador + learning service en fire-and-forget. NUNCA bloquea
    // ni cambia el resultado del job legacy.
    try {
      if (AILearningFeatureFlag.isEnabled(companyId)) {
        // Disparamos sin await: el learning service registra todo en
        // AICorrectionLearned y AICorrectionReviewQueue de forma asíncrona.
        void CorrectionLearningService.handle({
          aiAgentLogId: lastIALog.id,
          humanCorrectionText: humanMessageContent,
          ticketId,
          companyId,
          lastAiResponse: lastIALog.outputSummary || "",
          appliedByUserId: (job.data as any).humanUserId
        }).then(res => {
          logger.info(
            `[HumanCorrection] CorrectionLearning outcome=${res.outcome} ` +
            `corrId=${res.supportCorrectionId || "-"} reviewId=${res.reviewQueueId || "-"}`
          );
        }).catch((e: any) => {
          logger.warn(`[HumanCorrection] CorrectionLearning falló (silenciado): ${e.message}`);
        });
      }
    } catch (learningErr: any) {
      // Defensa extra: el hook NUNCA debe romper el job legacy
      logger.warn(`[HumanCorrection] Hook learning falló (silenciado): ${learningErr.message}`);
    }

    return { detected: true, correctedLogId: lastIALog.id };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[HumanCorrection] Error: ${msg}`);
    return { detected: false };
  }
};

export default handle;
