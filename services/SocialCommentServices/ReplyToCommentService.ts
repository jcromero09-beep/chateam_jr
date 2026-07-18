/**
 * Service: ReplyToCommentService
 * Respuesta MANUAL a un comentario de Facebook/Instagram.
 * - FB: POST /{commentId}/comments (CommentReplyExecutor.replyToComment)
 * - IG: POST /{commentId}/replies (CommentReplyExecutor.replyToIGComment)
 *   Regla IG: si el comentario es anidado, la respuesta va al comentario padre
 *   (IG solo permite replies a primer nivel). IG no permite responder ocultos.
 * Éxito → setAutoReply + markReplySent + crea registro hijo fromMe=true + socket.
 */

import UGCPostComment from "../../models/UGCPostComment";
import UGCSocialPost from "../../models/UGCSocialPost";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import getCommentAccessToken from "./getCommentAccessToken";
import {
  replyToComment,
  replyToIGComment
} from "../CommentAutoReplyServices/CommentReplyExecutor";
import {
  SocialCommentDTO,
  toSocialCommentDTO,
  SOCIAL_COMMENT_SOCKET_EVENT
} from "./dto";

interface Request {
  companyId: number;
  commentId: number;
  message: string;
}

interface Response {
  reply: SocialCommentDTO;
  comment: SocialCommentDTO;
}

/** Resuelve la conexión Whatsapp del comentario (FK directa o metadata del post). */
const resolveWhatsapp = async (
  comment: UGCPostComment,
  companyId: number
): Promise<Whatsapp | null> => {
  if (comment.whatsapp) {
    return comment.whatsapp;
  }

  if (comment.whatsappId) {
    return Whatsapp.findOne({
      where: { id: comment.whatsappId, companyId }
    });
  }

  const post = await UGCSocialPost.findOne({
    where: { id: comment.socialPostId, companyId },
    attributes: ["id", "metadata"]
  });
  const meta = (post?.metadata || {}) as Record<string, unknown>;
  if (typeof meta.whatsappId === "number") {
    return Whatsapp.findOne({
      where: { id: meta.whatsappId, companyId }
    });
  }

  return null;
};

const ReplyToCommentService = async ({
  companyId,
  commentId,
  message
}: Request): Promise<Response> => {
  const text = (message || "").trim();
  if (!text) {
    throw new AppError("ERR_EMPTY_MESSAGE: El mensaje es requerido", 400);
  }

  const comment = await UGCPostComment.findOne({
    where: { id: commentId, companyId },
    include: [
      { model: Whatsapp, as: "whatsapp", required: false },
      { model: UGCPostComment, as: "parentComment", required: false }
    ]
  });

  if (!comment) {
    throw new AppError("ERR_COMMENT_NOT_FOUND: Comentario no encontrado", 404);
  }

  if (comment.isDeleted) {
    throw new AppError(
      "ERR_COMMENT_DELETED: No se puede responder a un comentario eliminado",
      400
    );
  }

  if (comment.platform !== "facebook" && comment.platform !== "instagram") {
    throw new AppError(
      "ERR_UNSUPPORTED_PLATFORM: Solo se soportan comentarios de Facebook e Instagram",
      400
    );
  }

  const whatsapp = await resolveWhatsapp(comment, companyId);
  if (!whatsapp) {
    throw new AppError(
      "ERR_NO_CONNECTION: El comentario no tiene una conexión Meta asociada",
      400
    );
  }

  const token = getCommentAccessToken(whatsapp);
  if (!token) {
    throw new AppError(
      "ERR_NO_TOKEN: La conexión no tiene Page Access Token configurado",
      400
    );
  }

  // ID local del padre para el registro hijo en BD
  let parentLocalId = comment.id;
  // ID del nuevo comentario devuelto por la Graph API
  let newPlatformCommentId: string | null = null;

  if (comment.platform === "instagram") {
    // IG no permite responder comentarios ocultos
    if (comment.isHidden) {
      throw new AppError(
        "ERR_IG_HIDDEN: Instagram no permite responder comentarios ocultos",
        400
      );
    }

    // IG solo permite replies a primer nivel → si es anidado, responder al padre
    let targetPlatformId = comment.platformCommentId;
    if (comment.parentCommentId) {
      const parent =
        comment.parentComment ||
        (await UGCPostComment.findOne({
          where: { id: comment.parentCommentId, companyId }
        }));
      if (!parent) {
        throw new AppError(
          "ERR_PARENT_NOT_FOUND: Comentario padre no encontrado",
          404
        );
      }
      targetPlatformId = parent.platformCommentId;
      parentLocalId = parent.id;
    }

    const igResult = await replyToIGComment(targetPlatformId, text, token);
    newPlatformCommentId = igResult.id || null;
  } else {
    const fbResult = await replyToComment(comment.platformCommentId, text, token);
    newPlatformCommentId = fbResult.id || null;
  }

  // Marcar el comentario original como respondido (métodos del modelo)
  await comment.setAutoReply(text);
  await comment.markReplySent();

  // Registrar nuestra respuesta como comentario hijo (fromMe=true)
  const pageName = whatsapp.name || "Página";
  const newReply = await UGCPostComment.create({
    companyId,
    socialPostId: comment.socialPostId,
    platform: comment.platform,
    platformCommentId:
      newPlatformCommentId ||
      `manual_${comment.platformCommentId}_${Date.now()}`,
    content: text,
    authorUsername: pageName,
    authorDisplayName: pageName,
    parentCommentId: parentLocalId,
    whatsappId: whatsapp.id,
    fromMe: true,
    autoReplyStatus: "skipped",
    commentType: "neutral",
    sentiment: "neutral",
    postedAt: new Date(),
    metadata: { source: "manual_reply", repliedToCommentId: comment.id }
  } as unknown as UGCPostComment);

  const replyDTO = toSocialCommentDTO(newReply);

  // Tiempo real: el frontend espera el DTO completo del nuevo reply
  const io = getIO();
  io.of(String(companyId)).emit(SOCIAL_COMMENT_SOCKET_EVENT(companyId), replyDTO);

  logger.info(
    `[SocialComments] Respuesta manual enviada (company ${companyId}, comment ${comment.id}, platform ${comment.platform})`
  );

  return { reply: replyDTO, comment: toSocialCommentDTO(comment) };
};

export default ReplyToCommentService;
