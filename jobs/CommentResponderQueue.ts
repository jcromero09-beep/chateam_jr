/**
 * Job: CommentResponderQueue — Módulo Comentarios FB/IG (GAP 3).
 *
 * Motor de respuesta automática a comentarios. Se procesa en el BACKEND
 * (backendQueues.ts, concurrencia 3) porque necesita Socket.IO para emitir
 * el DTO actualizado al inbox en tiempo real.
 *
 * Garantía CERO duplicados:
 *   - CANDADO ATÓMICO: UPDATE autoReplyStatus='generating'
 *     WHERE id=? AND companyId=? AND autoReplyStatus='pending'.
 *     Si affectedRows=0 → otro proceso lo tomó → salir sin side effects.
 *
 * Modos (re-resueltos en ejecución — pudieron cambiar tras encolar):
 *   - manual       → revertir a 'pending' y salir (lo verá un humano)
 *   - auto_message → texto fijo del setting
 *   - ai           → SupervisorService.processMessage (+ cobro de créditos)
 *
 * Restricciones Meta:
 *   - IG solo permite reply a comentarios de primer nivel → si el comentario
 *     tiene padre, la respuesta va al comentario padre.
 *   - Nunca responder comentarios ocultos/eliminados/propios (fromMe).
 */
import { Job } from "bull";
import UGCPostComment from "../models/UGCPostComment";
import UGCSocialPost from "../models/UGCSocialPost";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import ResolveResponseModeService from "../services/SocialCommentServices/ResolveResponseModeService";
import getCommentAccessToken from "../services/SocialCommentServices/getCommentAccessToken";
import {
  toSocialCommentDTO,
  SOCIAL_COMMENT_SOCKET_EVENT
} from "../services/SocialCommentServices/dto";
import {
  replyToComment,
  replyToIGComment
} from "../services/CommentAutoReplyServices/CommentReplyExecutor";
import SupervisorService from "../services/AIAgentServices/SupervisorService";
import { chargeAIUsage } from "../services/AICreditServices/AIUsagePricingService";
import { getIO } from "../libs/socket";

export interface CommentResponderJobData {
  /** id (BD) del UGCPostComment a responder. */
  commentId: number;
  companyId: number;
}

/** Revierte el candado a 'pending' para que lo retome un humano u otro ciclo. */
const revertToPending = async (
  commentId: number,
  companyId: number,
  reason: string
): Promise<void> => {
  await UGCPostComment.update(
    { autoReplyStatus: "pending" },
    { where: { id: commentId, companyId, autoReplyStatus: "generating" } }
  );
  logger.info(
    `[CommentResponder] Comentario ${commentId} revertido a 'pending' (${reason})`
  );
};

/** Emite el DTO actualizado al inbox (tolerante a IO no inicializado). */
const emitUpdatedComment = (companyId: number, comment: UGCPostComment): void => {
  try {
    const io = getIO();
    io.of(String(companyId)).emit(
      SOCIAL_COMMENT_SOCKET_EVENT(companyId),
      toSocialCommentDTO(comment)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[CommentResponder] Socket.IO no disponible al emitir comentario ${comment.id}: ${message}`
    );
  }
};

const handleCommentResponder = async (job: Job): Promise<void> => {
  const { commentId, companyId } = job.data as CommentResponderJobData;

  if (!commentId || !companyId) {
    logger.warn(
      `[CommentResponder] Job sin commentId/companyId válidos — descartado`
    );
    return;
  }

  // 1. Cargar comentario + conexión + post (eager loading, companyId SIEMPRE)
  const comment = await UGCPostComment.findOne({
    where: { id: commentId, companyId },
    include: [
      { model: UGCSocialPost, as: "socialPost" },
      { model: Whatsapp, as: "whatsapp" }
    ]
  });

  if (!comment) {
    logger.warn(
      `[CommentResponder] Comentario ${commentId} (company=${companyId}) no existe — descartado`
    );
    return;
  }

  // 2. Nunca responder ocultos / eliminados / propios
  if (comment.isDeleted || comment.isHidden || comment.fromMe) {
    if (comment.autoReplyStatus === "pending") {
      await comment.skipReply();
      emitUpdatedComment(companyId, comment);
    }
    return;
  }

  // 3. CANDADO ATÓMICO — garantiza CERO respuestas duplicadas
  const [lockedRows] = await UGCPostComment.update(
    { autoReplyStatus: "generating" },
    { where: { id: commentId, companyId, autoReplyStatus: "pending" } }
  );
  if (lockedRows === 0) {
    logger.info(
      `[CommentResponder] Candado no adquirido para comentario ${commentId} ` +
        `(otro proceso lo tomó o ya no está 'pending') — salir`
    );
    return;
  }
  await comment.reload();

  const whatsapp = comment.whatsapp;
  if (!whatsapp || !comment.whatsappId) {
    logger.error(
      `[CommentResponder] Comentario ${commentId} sin conexión Whatsapp asociada`
    );
    await comment.markReplyFailed();
    emitUpdatedComment(companyId, comment);
    return;
  }

  // 4. Re-resolver el modo (pudo cambiar entre encolado y ejecución)
  const resolved = await ResolveResponseModeService(
    companyId,
    comment.whatsappId,
    comment.socialPostId
  );

  if (resolved.mode === "manual") {
    await revertToPending(commentId, companyId, "modo cambió a manual");
    return;
  }

  // 5. Construir el texto de respuesta según modo
  let replyText = "";
  let aiTokensUsed = 0;
  const isAiMode = resolved.mode === "ai";

  if (resolved.mode === "auto_message") {
    replyText = (resolved.setting?.autoMessage || "").trim();
    if (!replyText) {
      logger.warn(
        `[CommentResponder] Modo auto_message sin autoMessage configurado ` +
          `(setting=${resolved.setting?.id}) — comentario ${commentId} marcado 'skipped'`
      );
      await comment.skipReply();
      emitUpdatedComment(companyId, comment);
      return;
    }
  } else {
    // Modo 'ai' — SupervisorService genera la respuesta contextual
    try {
      const aiResponse = await SupervisorService.processMessage({
        message: comment.content,
        companyId,
        whatsappId: comment.whatsappId,
        channel: comment.platform
      });

      if (aiResponse.skipSend || aiResponse.shouldEscalate) {
        await revertToPending(
          commentId,
          companyId,
          aiResponse.shouldEscalate
            ? `IA escaló: ${aiResponse.escalationReason || "sin razón"}`
            : "gatekeeper decidió no enviar (skipSend)"
        );
        return;
      }

      replyText = (aiResponse.message || "").trim();
      aiTokensUsed =
        (aiResponse.totalTokens?.input || 0) +
        (aiResponse.totalTokens?.output || 0);

      if (!replyText) {
        await revertToPending(commentId, companyId, "IA devolvió texto vacío");
        return;
      }
    } catch (err) {
      // Créditos insuficientes ANTES de generar → revertir sin lanzar
      if (err instanceof AppError && err.statusCode === 402) {
        await revertToPending(
          commentId,
          companyId,
          `créditos IA insuficientes (${err.message})`
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[CommentResponder] Error generando respuesta IA para comentario ${commentId}: ${message}`
      );
      await comment.markReplyFailed();
      emitUpdatedComment(companyId, comment);
      return;
    }
  }

  // 6. Token de página: pageAccessToken → facebookUserToken (page token) → tokenMeta
  const accessToken = getCommentAccessToken(whatsapp);
  if (!accessToken) {
    logger.error(
      `[CommentResponder] Conexión ${whatsapp.id} sin token de página (pageAccessToken/facebookUserToken/tokenMeta) — ` +
        `no se puede responder comentario ${commentId}`
    );
    await comment.markReplyFailed();
    emitUpdatedComment(companyId, comment);
    return;
  }

  // 7. Resolver destino del reply.
  //    IG: solo permite reply a comentarios de primer nivel → si es reply,
  //    responder al comentario padre.
  let targetExternalId = comment.platformCommentId;
  if (comment.platform === "instagram" && comment.parentCommentId) {
    const parent = await UGCPostComment.findOne({
      where: { id: comment.parentCommentId, companyId }
    });
    if (parent) {
      if (parent.isHidden || parent.isDeleted) {
        // IG no permite responder comentarios ocultos
        await comment.skipReply();
        emitUpdatedComment(companyId, comment);
        logger.info(
          `[CommentResponder] Padre IG ${parent.id} oculto/eliminado — comentario ${commentId} 'skipped'`
        );
        return;
      }
      targetExternalId = parent.platformCommentId;
    }
  }

  // 8. Enviar vía Graph API v24.0
  try {
    if (comment.platform === "facebook") {
      await replyToComment(targetExternalId, replyText, accessToken);
    } else {
      await replyToIGComment(targetExternalId, replyText, accessToken);
    }
  } catch (err) {
    const message =
      err instanceof AppError || err instanceof Error
        ? err.message
        : String(err);
    logger.error(
      `[CommentResponder] Error de envío Graph API para comentario ${commentId} ` +
        `(${comment.platform}): ${message}`
    );
    await comment.markReplyFailed();
    emitUpdatedComment(companyId, comment);
    return;
  }

  // 9. Éxito → persistir texto + estado 'sent'
  await comment.setAutoReply(replyText);
  await comment.markReplySent();

  // 10. Cobro de créditos IA DESPUÉS de enviar OK (solo modo 'ai').
  //     Si falla el cobro aquí, la respuesta ya salió → solo log (no revertir).
  if (isAiMode) {
    try {
      await chargeAIUsage({
        companyId,
        creditTypeKey: "agent_execution",
        units: 1,
        source: "social_comment_ai",
        sourceId: comment.platformCommentId,
        tokensUsed: aiTokensUsed || undefined
      });
    } catch (err) {
      const message =
        err instanceof AppError || err instanceof Error
          ? err.message
          : String(err);
      logger.warn(
        `[CommentResponder] Respuesta enviada pero cobro de créditos falló ` +
          `(comentario ${commentId}, company=${companyId}): ${message}`
      );
    }
  }

  // 11. Tiempo real: DTO actualizado al inbox
  emitUpdatedComment(companyId, comment);

  logger.info(
    `[CommentResponder] ✅ Comentario ${commentId} respondido ` +
      `(mode=${resolved.mode}, platform=${comment.platform}, company=${companyId})`
  );
};

export default handleCommentResponder;
