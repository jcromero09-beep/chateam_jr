/**
 * TikTokAutoReplyService — Auto-reply IA a comentarios de TikTok
 *
 * Clasifica el comentario con CommentClassifierService,
 * genera respuesta con AgentResponseGeneratorService,
 * y envia reply real via TikTokReplyService.
 */
import UGCPostComment from "../../models/UGCPostComment";
import AgentIdentity from "../../models/AgentIdentity";
import CommentClassifierService from "../AgentEngagementServices/CommentClassifierService";
import AgentResponseGeneratorService from "../AgentEngagementServices/AgentResponseGeneratorService";
import TikTokReplyService from "./TikTokReplyService";
import logger from "../../utils/logger";

interface TikTokAutoReplyRequest {
  companyId: number;
  commentId: number;  // UGCPostComment.id
}

interface TikTokAutoReplyResponse {
  success: boolean;
  action: "replied" | "skipped" | "failed";
  replyContent?: string;
  reason?: string;
}

const TikTokAutoReplyService = async ({
  companyId,
  commentId,
}: TikTokAutoReplyRequest): Promise<TikTokAutoReplyResponse> => {
  try {
    // 1. Cargar el comentario
    const comment = await UGCPostComment.findByPk(commentId);
    if (!comment || comment.companyId !== companyId) {
      return { success: false, action: "failed", reason: "Comentario no encontrado" };
    }

    // Skip si ya fue respondido o es spam
    if (comment.autoReplyStatus !== "pending") {
      return { success: true, action: "skipped", reason: `Status: ${comment.autoReplyStatus}` };
    }

    // 2. Clasificar si no esta clasificado
    if (!comment.isClassified()) {
      try {
        const classification = await CommentClassifierService({
          companyId,
          commentContent: comment.content,
          authorUsername: comment.authorUsername,
          postContext: "",
        });

        await comment.classify(
          classification.commentType,
          classification.sentiment,
          classification.purchaseIntentScore,
          "gpt-4o-mini-auto"
        );

        logger.info(
          `[TikTokAutoReply] Clasificado: ${classification.commentType} / ${classification.sentiment} (score: ${classification.purchaseIntentScore})`
        );
      } catch (classErr: any) {
        logger.warn(`[TikTokAutoReply] Error clasificando: ${classErr.message}`);
        // Continue sin clasificacion
      }
    }

    // 3. Skip spam
    if (comment.isSpam()) {
      await comment.skipReply();
      return { success: true, action: "skipped", reason: "Comentario clasificado como spam" };
    }

    // 4. Buscar agente asignado o pool
    let agentIdentityId = comment.assignedAgentIdentityId;

    if (!agentIdentityId) {
      // Buscar primer agente activo de la company
      const agent = await AgentIdentity.findOne({
        where: { companyId, status: "active" },
        order: [["createdAt", "ASC"]],
      });

      if (!agent) {
        await comment.skipReply();
        return { success: true, action: "skipped", reason: "Sin agentes IA disponibles" };
      }

      agentIdentityId = agent.id;
      comment.assignedAgentIdentityId = agentIdentityId;
      await comment.save();
    }

    // 5. Generar respuesta en personaje
    comment.autoReplyStatus = "generating";
    await comment.save();

    const responseResult = await AgentResponseGeneratorService({
      companyId,
      agentIdentityId,
      commentContent: comment.content,
      commentType: comment.commentType,
      postContext: "",
    });

    if (!responseResult.response) {
      await comment.markReplyFailed();
      return { success: false, action: "failed", reason: "No se genero respuesta" };
    }

    // 6. Guardar respuesta generada
    await comment.setAutoReply(responseResult.response);

    // 7. Enviar reply real via Business API
    const replyResult = await TikTokReplyService({
      companyId,
      commentId: comment.id,
      replyText: responseResult.response,
    });

    if (!replyResult.success) {
      await comment.markReplyFailed();
      return { success: false, action: "failed", reason: replyResult.error };
    }

    logger.info(
      `[TikTokAutoReply] Auto-reply exitoso para comentario ${commentId}: "${responseResult.response.substring(0, 50)}..."`
    );

    return {
      success: true,
      action: "replied",
      replyContent: responseResult.response,
    };
  } catch (error: any) {
    logger.error(`[TikTokAutoReply] Error: ${error.message}`);
    // Marcar como fallido si podemos
    try {
      const comment = await UGCPostComment.findByPk(commentId);
      if (comment) await comment.markReplyFailed();
    } catch {}
    return { success: false, action: "failed", reason: error.message };
  }
};

export default TikTokAutoReplyService;
