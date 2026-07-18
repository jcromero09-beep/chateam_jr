/**
 * TikTokCommentPollerService — Nucleo del sistema de comentarios TikTok
 *
 * Polling periodico que almacena comentarios en modelos UGC:
 * 1. Busca conexiones TikTok activas con polling habilitado
 * 2. Para cada conexion, lista los ultimos 20 videos
 * 3. Crea/actualiza UGCSocialPost por cada video
 * 4. Obtiene comentarios nuevos (dedup por platformCommentId)
 * 5. Crea UGCPostComment por cada comentario nuevo
 * 6. Si Business API conectada + agente: auto-reply IA
 * 7. Emite eventos socket para actualizar el frontend en tiempo real
 */
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import { TikTokAPIClient, TikTokComment, TikTokVideo } from "./TikTokAPIClient";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

interface PollResult {
  connectionsPolled: number;
  newComments: number;
  errors: number;
}

const TikTokCommentPollerService = async (tiktokId?: number): Promise<PollResult> => {
  const result: PollResult = {
    connectionsPolled: 0,
    newComments: 0,
    errors: 0
  };

  try {
    // 1. Buscar conexiones TikTok activas con polling habilitado
    const whereClause: Record<string, unknown> = {
      channel: "tiktok",
      status: "CONNECTED",
      tiktokPollingEnabled: true,
      tiktokAccessToken: { [Op.ne]: null }
    };
    if (tiktokId) {
      whereClause.id = tiktokId;
    }

    const connections = await Whatsapp.findAll({
      where: whereClause as any
    });

    if (connections.length === 0) {
      return result;
    }

    logger.info(
      `[TikTokPoller] Iniciando polling para ${connections.length} conexiones TikTok`
    );

    // 2. Procesar cada conexion independientemente
    for (const conn of connections) {
      try {
        // Verificar intervalo dinamico
        if (!tiktokId && conn.tiktokLastPollAt && conn.tiktokPollingInterval) {
          const elapsed = Date.now() - new Date(conn.tiktokLastPollAt).getTime();
          const intervalMs = (conn.tiktokPollingInterval || 120) * 1000;
          if (elapsed < intervalMs) {
            continue; // Aun no toca pollear esta conexion
          }
        }

        await processConnection(conn, result);
        result.connectionsPolled++;
      } catch (connError: any) {
        result.errors++;
        logger.error(
          `[TikTokPoller] Error procesando conexion ${conn.id} (Company: ${conn.companyId}): ${connError.message}`
        );
        Sentry.captureException(connError, {
          tags: {
            service: "TikTokCommentPoller",
            whatsappId: String(conn.id),
            companyId: String(conn.companyId)
          }
        });
      }
    }

    if (result.newComments > 0 || result.errors > 0) {
      logger.info(
        `[TikTokPoller] Completado: ${result.connectionsPolled} conexiones, ` +
        `${result.newComments} comentarios nuevos, ${result.errors} errores`
      );
    }
  } catch (err: any) {
    logger.error(`[TikTokPoller] Error general: ${err.message}`);
    Sentry.captureException(err);
  }

  return result;
};

/**
 * Procesa una conexion TikTok individual:
 * lista videos, crea UGCSocialPost, obtiene comentarios y crea UGCPostComment
 */
const processConnection = async (
  conn: Whatsapp,
  result: PollResult
): Promise<void> => {
  const companyId = conn.companyId;

  // Buscar o crear UGCSocialAccount
  let socialAccountId: number | undefined;
  try {
    if (conn.tiktokOpenId) {
      const [account] = await UGCSocialAccount.findOrCreate({
        where: { companyId, platform: "tiktok", platformAccountId: conn.tiktokOpenId },
        defaults: {
          username: conn.name || "TikTok User",
          displayName: conn.name || "TikTok User",
          status: "active",
        } as any,
      });
      socialAccountId = account.id;
    }
  } catch (accErr: any) {
    logger.warn(`[TikTokPoller] No se pudo crear UGCSocialAccount: ${accErr.message}`);
  }

  // Crear instancia del cliente API
  const client = new TikTokAPIClient(conn.tiktokAccessToken);

  // Listar ultimos 20 videos con paginacion
  let allVideos: TikTokVideo[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < 3) { // Max 3 paginas = 60 videos
    const videoResponse = await client.listVideos(cursor, 20);
    const videos = videoResponse.videos || [];
    allVideos = allVideos.concat(videos);
    cursor = videoResponse.cursor || undefined;
    hasMore = videoResponse.has_more && !!cursor;
    pageCount++;
  }

  if (allVideos.length === 0) {
    await conn.update({ tiktokLastPollAt: new Date() });
    return;
  }

  // Procesar comentarios de cada video
  for (const video of allVideos) {
    try {
      await processVideoComments(conn, client, video, result, companyId, socialAccountId);
    } catch (videoError: any) {
      result.errors++;
      logger.error(
        `[TikTokPoller] Error procesando video ${video.id}: ${videoError.message}`
      );
    }
  }

  // Actualizar timestamp del ultimo polling
  await conn.update({ tiktokLastPollAt: new Date() });
};

/**
 * Procesa los comentarios de un video individual.
 * Crea/actualiza UGCSocialPost y UGCPostComment.
 */
const processVideoComments = async (
  conn: Whatsapp,
  client: TikTokAPIClient,
  video: TikTokVideo,
  result: PollResult,
  companyId: number,
  socialAccountId?: number
): Promise<void> => {
  // Crear o actualizar UGCSocialPost para este video
  const [post, postCreated] = await UGCSocialPost.findOrCreate({
    where: { companyId, platform: "tiktok", platformPostId: video.id },
    defaults: {
      postType: "short",
      caption: video.title || "",
      thumbnailUrl: video.cover_image_url || "",
      mediaUrl: video.share_url || "",
      status: "published",
      publishedAt: video.create_time ? new Date(video.create_time * 1000) : new Date(),
      socialAccountId: socialAccountId || null,
      metadata: { shareUrl: video.share_url },
    } as any,
  });

  if (!postCreated) {
    // Actualizar thumbnail y caption si cambio
    await post.update({
      caption: video.title || post.caption,
      thumbnailUrl: video.cover_image_url || post.thumbnailUrl,
    } as any);
  }

  // Obtener comentarios del video con paginacion
  let allComments: TikTokComment[] = [];
  let commentCursor: string | undefined;
  let commentHasMore = true;

  while (commentHasMore) {
    const commentResponse = await client.getVideoComments(video.id, commentCursor, 100);
    const comments = commentResponse.comments || [];
    allComments = allComments.concat(comments);
    commentCursor = commentResponse.cursor || undefined;
    commentHasMore = commentResponse.has_more && !!commentCursor;

    // Limitar a 500 comentarios por video para evitar rate limits
    if (allComments.length >= 500) break;
  }

  if (allComments.length === 0) return;

  // Actualizar conteo de comentarios en el post
  await post.update({ comments: allComments.length } as any);

  let newCount = 0;
  for (const comment of allComments) {
    try {
      const isNew = await processComment(conn, post, video, comment, companyId);
      if (isNew) {
        result.newComments++;
        newCount++;
      }
    } catch (commentError: any) {
      result.errors++;
      logger.error(
        `[TikTokPoller] Error procesando comentario ${comment.id}: ${commentError.message}`
      );
    }
  }

  if (newCount > 0) {
    logger.info(
      `[TikTokPoller] Video ${video.id}: ${newCount} comentarios nuevos de ${allComments.length} total`
    );
  }
};

/**
 * Procesa un comentario individual:
 * dedup via UGCPostComment.platformCommentId, crea registro UGC
 */
const processComment = async (
  conn: Whatsapp,
  post: UGCSocialPost,
  video: TikTokVideo,
  comment: TikTokComment,
  companyId: number
): Promise<boolean> => {
  // Deduplicacion via platformCommentId
  const existing = await UGCPostComment.findOne({
    where: { platformCommentId: comment.id, companyId }
  });

  if (existing) {
    // Actualizar likes/replies si cambio
    if (existing.likeCount !== comment.like_count || existing.replyCount !== comment.reply_count) {
      await existing.update({
        likeCount: comment.like_count || 0,
        replyCount: comment.reply_count || 0,
      } as any);
    }
    return false; // No es nuevo
  }

  // Filtrar comentarios anteriores al ultimo poll (solo para polling automatico)
  if (conn.tiktokLastPollAt) {
    const commentTimestamp = comment.create_time * 1000;
    const lastPollTimestamp = new Date(conn.tiktokLastPollAt).getTime();
    if (commentTimestamp < lastPollTimestamp - 60000) { // 1 min de margen
      return false;
    }
  }

  // Resolver parentCommentId si es reply
  let parentCommentId: number | null = null;
  if (comment.parent_comment_id) {
    const parentComment = await UGCPostComment.findOne({
      where: { platformCommentId: comment.parent_comment_id, companyId }
    });
    if (parentComment) {
      parentCommentId = parentComment.id;
    }
  }

  // Crear UGCPostComment
  const newComment = await UGCPostComment.create({
    companyId,
    socialPostId: post.id,
    platform: "tiktok",
    platformCommentId: comment.id,
    content: comment.text,
    authorUsername: "TikTok User", // Research API no provee username
    parentCommentId,
    whatsappId: conn.id,
    fromMe: false,
    likeCount: comment.like_count || 0,
    replyCount: comment.reply_count || 0,
    postedAt: new Date(comment.create_time * 1000),
    commentType: "neutral",
    sentiment: "neutral",
    autoReplyStatus: "pending",
    metadata: {
      videoId: video.id,
      videoTitle: video.title,
      videoUrl: video.share_url,
      videoCover: video.cover_image_url,
    },
  } as any);

  // Emitir socket para el frontend
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-tiktok-comments`, {
    action: "new_comment",
    comment: newComment,
    postId: post.id,
  });

  // Auto-reply IA si Business API conectada y hay agente asignado
  if (conn.tiktokBusinessConnected && conn.tiktokBusinessAccessToken && !parentCommentId) {
    try {
      const TikTokAutoReplyService = (await import("./TikTokAutoReplyService")).default;
      await TikTokAutoReplyService({
        companyId,
        commentId: newComment.id,
      });
    } catch (aiErr: any) {
      // Error de IA NO detiene el polling
      logger.warn(
        `[TikTokPoller] Auto-reply error para comentario ${newComment.id}: ${aiErr.message}`
      );
    }
  }

  return true; // Es nuevo
};

export default TikTokCommentPollerService;
