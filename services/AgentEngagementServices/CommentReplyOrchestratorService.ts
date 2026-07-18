/**
 * Service: CommentReplyOrchestratorService
 * Orquesta el flujo completo de respuesta a un comentario:
 * 1. Cargar comentario de UGCPostComment
 * 2. Si commentType es null, llamar CommentClassifierService
 * 3. Seleccionar mejor agente (el asignado o uno del pool por niche)
 * 4. Llamar AgentResponseGeneratorService
 * 5. Guardar autoReplyContent en UGCPostComment
 * 6. Encolar en AgentInteractionQueue para ejecutar en dispositivo
 * 7. Llamar AgentMemoryExtractorService para extraer datos de la respuesta
 */

import UGCPostComment from "../../models/UGCPostComment";
import UGCSocialPost from "../../models/UGCSocialPost";
import AgentIdentity from "../../models/AgentIdentity";
import AgentInteraction from "../../models/AgentInteraction";
import CommentClassifierService from "./CommentClassifierService";
import AgentResponseGeneratorService from "./AgentResponseGeneratorService";
import AgentMemoryExtractorService from "./AgentMemoryExtractorService";
import { add } from "../../queues";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CommentReplyOrchestratorRequest {
  companyId: number;
  commentId: number;
  userId?: number;
}

interface CommentReplyOrchestratorResponse {
  commentId: number;
  agentIdentityId: number;
  replyContent: string;
  consistencyScore: number;
  interactionId: number;
  memoriesExtracted: number;
}

const CommentReplyOrchestratorService = async (
  params: CommentReplyOrchestratorRequest
): Promise<CommentReplyOrchestratorResponse> => {
  const { companyId, commentId, userId } = params;

  // 1. Cargar comentario con relaciones
  const comment = await UGCPostComment.findOne({
    where: { id: commentId, companyId },
    include: [
      {
        model: UGCSocialPost,
        as: "socialPost",
        required: true
      }
    ]
  });

  if (!comment) {
    throw new AppError("ERR_UGC_COMMENT_NOT_FOUND", 404);
  }

  if (comment.autoReplyStatus === "sent") {
    throw new AppError("ERR_UGC_COMMENT_ALREADY_REPLIED", 400);
  }

  // Marcar como generando
  await comment.update({ autoReplyStatus: "generating" });

  try {
    // 2. Clasificar si no tiene commentType
    if (!comment.isClassified()) {
      const classification = await CommentClassifierService({
        companyId,
        commentContent: comment.content,
        authorUsername: comment.authorUsername,
        postContext: comment.socialPost?.caption || undefined,
        userId
      });

      await comment.classify(
        classification.commentType,
        classification.sentiment,
        classification.purchaseIntentScore,
        "gpt-5.5"
      );
      await comment.reload();
    }

    // 3. Seleccionar agente: el asignado o uno del pool por niche
    let agentIdentityId = comment.assignedAgentIdentityId;

    if (!agentIdentityId) {
      // Buscar agente del pool que tenga niche compatible con el post
      const socialPost = comment.socialPost;
      const poolAgent = await AgentIdentity.findOne({
        where: {
          companyId,
          status: "active"
        },
        order: [["createdAt", "ASC"]]
      });

      if (!poolAgent) {
        throw new AppError("ERR_UGC_NO_AGENTS_AVAILABLE", 404);
      }

      agentIdentityId = poolAgent.id;
      await comment.update({ assignedAgentIdentityId: agentIdentityId });
    }

    // 4. Generar respuesta en personaje
    const { response: replyContent, consistencyScore } = await AgentResponseGeneratorService({
      companyId,
      agentIdentityId,
      commentContent: comment.content,
      commentType: comment.commentType,
      postContext: comment.socialPost?.caption || undefined,
      userId
    });

    // 5. Guardar autoReplyContent
    await comment.update({
      autoReplyContent: replyContent,
      autoReplyStatus: "generated",
      metadata: { ...((comment.metadata as Record<string, unknown>) || {}), consistencyScore }
    });

    // 6. Crear registro AgentInteraction y encolar
    const interaction = await AgentInteraction.create({
      companyId,
      agentIdentityId,
      type: "reply",
      platform: comment.platform,
      content: replyContent,
      targetPostId: comment.socialPost?.platformPostId || String(comment.socialPostId),
      targetCommentId: comment.platformCommentId,
      sentiment: comment.sentiment as "positive" | "neutral" | "negative" | "purchase_intent",
      consistencyScore,
      executionStatus: "pending",
      metadata: {
        commentId: comment.id,
        authorUsername: comment.authorUsername,
        commentType: comment.commentType
      }
    } as Partial<AgentInteraction> as AgentInteraction);

    // Encolar para ejecucion en dispositivo
    try {
      await add("AgentInteractionQueue", {
        companyId,
        interactionId: interaction.id,
        agentIdentityId,
        type: "reply",
        content: replyContent,
        targetPostId: comment.socialPost?.platformPostId || String(comment.socialPostId)
      });
    } catch (queueError: unknown) {
      const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
      logger.warn(
        `[CommentReplyOrchestratorService] No se pudo encolar interaccion: ${queueMsg}`
      );
    }

    // 7. Extraer memorias (no critico)
    let memoriesExtracted = 0;
    try {
      const memResult = await AgentMemoryExtractorService({
        companyId,
        agentIdentityId,
        responseContent: replyContent,
        context: `Respuesta a comentario de @${comment.authorUsername}: "${comment.content}"`
      });
      memoriesExtracted = memResult.memoriesExtracted;
    } catch (memError: unknown) {
      const memMsg = memError instanceof Error ? memError.message : String(memError);
      logger.warn(
        `[CommentReplyOrchestratorService] Error extrayendo memorias (no critico): ${memMsg}`
      );
    }

    logger.info(
      `[CommentReplyOrchestratorService] Flujo completado: commentId=${commentId}, ` +
      `agentId=${agentIdentityId}, consistencyScore=${consistencyScore}, ` +
      `memorias=${memoriesExtracted}, company=${companyId}`
    );

    return {
      commentId,
      agentIdentityId,
      replyContent,
      consistencyScore,
      interactionId: interaction.id,
      memoriesExtracted
    };
  } catch (error: unknown) {
    // Si falla, marcar como failed
    await comment.update({ autoReplyStatus: "failed" });

    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[CommentReplyOrchestratorService] Error en flujo de respuesta: ${errorMessage}`
    );
    throw new AppError("ERR_UGC_COMMENT_REPLY_ORCHESTRATION_FAILED", 500);
  }
};

export default CommentReplyOrchestratorService;
