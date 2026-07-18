/**
 * TikTokReplyService — Responder a un comentario de TikTok via Business API
 *
 * Envia un reply real al comentario en TikTok y crea el registro
 * UGCPostComment correspondiente con fromMe=true.
 */
import UGCPostComment from "../../models/UGCPostComment";
import Whatsapp from "../../models/Whatsapp";
import { TikTokBusinessAPIClient } from "./TikTokBusinessAPIClient";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

interface TikTokReplyRequest {
  companyId: number;
  commentId: number;  // UGCPostComment.id
  replyText: string;
  userId?: number;
}

interface TikTokReplyResponse {
  success: boolean;
  replyComment?: UGCPostComment;
  error?: string;
}

const TikTokReplyService = async ({
  companyId,
  commentId,
  replyText,
  userId,
}: TikTokReplyRequest): Promise<TikTokReplyResponse> => {
  try {
    logger.info(
      `[TikTokReply] Respondiendo comentario ${commentId} para company ${companyId}`
    );

    // 1. Cargar el comentario original
    const comment = await UGCPostComment.findOne({
      where: { id: commentId, companyId },
    });

    if (!comment) {
      throw new Error(`Comentario ${commentId} no encontrado`);
    }

    if (!comment.whatsappId) {
      throw new Error("El comentario no tiene conexion TikTok asociada");
    }

    // 2. Cargar la conexion TikTok
    const whatsapp = await Whatsapp.findOne({
      where: { id: comment.whatsappId, companyId },
    });

    if (!whatsapp) {
      throw new Error("Conexion TikTok no encontrada");
    }

    if (!whatsapp.tiktokBusinessConnected || !whatsapp.tiktokBusinessAccessToken) {
      throw new Error(
        "Business API no conectada. Conecta Business API desde TikTok Connections."
      );
    }

    // 3. Enviar reply via Business API
    const client = new TikTokBusinessAPIClient(whatsapp.tiktokBusinessAccessToken);
    const result = await client.replyToComment(
      comment.platformCommentId,
      replyText
    );

    logger.info(
      `[TikTokReply] Reply enviado exitosamente. Reply comment ID: ${result.comment_id}`
    );

    // 4. Crear UGCPostComment hijo con fromMe=true
    const replyComment = await UGCPostComment.create({
      companyId,
      socialPostId: comment.socialPostId,
      platform: "tiktok",
      platformCommentId: result.comment_id || `reply_${Date.now()}`,
      authorUsername: "Tu",
      authorDisplayName: "Tu respuesta",
      content: replyText,
      parentCommentId: comment.id,
      whatsappId: comment.whatsappId,
      fromMe: true,
      commentType: "neutral",
      sentiment: "neutral",
      autoReplyStatus: "sent",
      autoRepliedAt: new Date(),
      postedAt: new Date(),
      metadata: {
        replyToCommentId: comment.platformCommentId,
        sentBy: userId ? `user_${userId}` : "manual",
      },
    } as any);

    // 5. Actualizar el comentario padre
    await comment.markReplySent();

    // 6. Emitir socket event
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-tiktok-comments`, {
      action: "reply_sent",
      comment: replyComment,
      parentCommentId: comment.id,
      postId: comment.socialPostId,
    });

    return { success: true, replyComment };
  } catch (error: any) {
    logger.error(`[TikTokReply] Error: ${error.message}`);
    Sentry.captureException(error);
    return { success: false, error: error.message };
  }
};

export default TikTokReplyService;
