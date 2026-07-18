/**
 * Service: SyncPostCommentsService
 * Sincronización on-demand de posts + comentarios de Facebook/Instagram
 * para una conexión (whatsappId) vía Graph API v24.0.
 * - FB: GET /{pageId}/posts → GET /{postId}/comments?filter=stream
 * - IG: GET /{igId}/media → GET /{mediaId}/comments (con replies anidadas)
 * Upsert idempotente: NO duplica (findOne por platformCommentId primero).
 * Nuevos comentarios → autoReplyStatus 'pending' (o 'skipped' si fromMe).
 */

import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import getCommentAccessToken from "./getCommentAccessToken";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";
const GRAPH_TIMEOUT_MS = 15000;
const POSTS_LIMIT = 10;
const COMMENTS_LIMIT = 50;

const SCOPES_HINT =
  "Verifica que el token tenga los scopes: pages_show_list, pages_read_engagement, " +
  "pages_manage_engagement, pages_read_user_content, instagram_basic, instagram_manage_comments";

// ─── Tipos Graph API ──────────────────────────────────────────────────────

interface GraphFrom {
  id?: string;
  name?: string;
}

interface FBPost {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
  full_picture?: string;
}

interface FBComment {
  id: string;
  message?: string;
  from?: GraphFrom;
  created_time?: string;
  like_count?: number;
  parent?: { id?: string };
}

interface IGMedia {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
  media_url?: string;
}

interface IGComment {
  id: string;
  text?: string;
  from?: GraphFrom;
  username?: string;
  timestamp?: string;
  like_count?: number;
  replies?: { data?: IGComment[] };
}

interface GraphListResponse<T> {
  data?: T[];
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

// ─── Request / Response ───────────────────────────────────────────────────

interface Request {
  companyId: number;
  whatsappId: number;
}

interface Response {
  postsSynced: number;
  commentsSynced: number;
  newComments: number;
}

interface CommentUpsertInput {
  platformCommentId: string;
  content: string;
  authorUsername: string;
  authorDisplayName?: string;
  postedAt?: Date;
  likeCount: number;
  fromMe: boolean;
  parentPlatformCommentId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const graphGet = async <T>(
  url: string,
  params: Record<string, string | number>
): Promise<T> => {
  try {
    const response = await axios.get<T>(url, {
      params,
      timeout: GRAPH_TIMEOUT_MS
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data as GraphErrorBody | undefined;
      const graphMsg = body?.error?.message || error.message;
      const code = body?.error?.code;

      // 190: token inválido/expirado — 200/10/3: permisos insuficientes
      if (code === 190) {
        throw new AppError(
          `ERR_META_TOKEN_INVALID: Token inválido o expirado. ${graphMsg}`,
          400
        );
      }
      if (code === 200 || code === 10 || code === 3) {
        throw new AppError(
          `ERR_META_PERMISSIONS: El token no tiene permisos suficientes. ${SCOPES_HINT}. Detalle: ${graphMsg}`,
          400
        );
      }
      throw new AppError(`ERR_GRAPH_API: ${graphMsg}`, 502);
    }
    throw new AppError(`ERR_GRAPH_API: ${String(error)}`, 502);
  }
};

const parseDate = (value?: string): Date | undefined =>
  value ? new Date(value) : undefined;

const SyncPostCommentsService = async ({
  companyId,
  whatsappId
}: Request): Promise<Response> => {
  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId }
  });

  if (!whatsapp) {
    throw new AppError("ERR_WHATSAPP_NOT_FOUND: Conexión no encontrada", 404);
  }

  const token = getCommentAccessToken(whatsapp);
  if (!token) {
    throw new AppError(
      "ERR_NO_TOKEN: La conexión no tiene Page Access Token configurado",
      400
    );
  }

  const pageId = whatsapp.facebookPageUserId;
  const igId = whatsapp.instagramBusinessAccountId;

  if (!pageId && !igId) {
    throw new AppError(
      "ERR_NO_META_ACCOUNT: La conexión no tiene página de Facebook ni cuenta de Instagram Business asociada",
      400
    );
  }

  const result: Response = {
    postsSynced: 0,
    commentsSynced: 0,
    newComments: 0
  };

  // Mapa local platformCommentId → id BD para resolver padres sin N+1 extra
  const localIdByPlatformId = new Map<string, number>();

  /** Cuenta social (FB o IG) — crea si no existe, nunca borra (BD SAGRADA). */
  const ensureAccount = async (
    platform: "facebook" | "instagram",
    platformAccountId: string
  ): Promise<UGCSocialAccount> => {
    const existing = await UGCSocialAccount.findOne({
      where: { companyId, platform, platformAccountId }
    });
    if (existing) {
      return existing;
    }
    return UGCSocialAccount.create({
      companyId,
      platform,
      platformAccountId,
      username: whatsapp.name || platformAccountId,
      displayName: whatsapp.name || platformAccountId,
      accessToken: token,
      status: "active",
      metadata: { whatsappId: whatsapp.id, source: "social_comments_sync" }
    } as unknown as UGCSocialAccount);
  };

  /** Post — upsert por (companyId, platform, platformPostId). */
  const upsertPost = async (
    account: UGCSocialAccount,
    platform: "facebook" | "instagram",
    platformPostId: string,
    data: {
      caption?: string;
      permalink?: string;
      thumbnailUrl?: string;
      publishedAt?: Date;
    }
  ): Promise<UGCSocialPost> => {
    const existing = await UGCSocialPost.findOne({
      where: { companyId, platform, platformPostId }
    });

    if (existing) {
      // Asegurar metadata.whatsappId + permalink sin pisar lo que ya hay
      const meta = (existing.metadata || {}) as Record<string, unknown>;
      const needsUpdate =
        meta.whatsappId !== whatsapp.id ||
        (data.permalink && meta.permalink !== data.permalink);
      if (needsUpdate) {
        existing.metadata = {
          ...meta,
          whatsappId: whatsapp.id,
          ...(data.permalink ? { permalink: data.permalink } : {})
        };
        await existing.save();
      }
      return existing;
    }

    return UGCSocialPost.create({
      companyId,
      socialAccountId: account.id,
      platform,
      platformPostId,
      postType: "feed",
      status: "published",
      caption: data.caption,
      thumbnailUrl: data.thumbnailUrl,
      publishedAt: data.publishedAt,
      metadata: { whatsappId: whatsapp.id, permalink: data.permalink || null }
    } as unknown as UGCSocialPost);
  };

  /** Comentario — NO duplicar: findOne por platformCommentId primero. */
  const upsertComment = async (
    post: UGCSocialPost,
    platform: "facebook" | "instagram",
    input: CommentUpsertInput
  ): Promise<void> => {
    result.commentsSynced += 1;

    const existing = await UGCPostComment.findOne({
      where: { companyId, platformCommentId: input.platformCommentId }
    });
    if (existing) {
      localIdByPlatformId.set(input.platformCommentId, existing.id);
      return;
    }

    // Resolver padre local (replies)
    let parentCommentId: number | null = null;
    if (input.parentPlatformCommentId) {
      const mapped = localIdByPlatformId.get(input.parentPlatformCommentId);
      if (mapped) {
        parentCommentId = mapped;
      } else {
        const parent = await UGCPostComment.findOne({
          where: {
            companyId,
            platformCommentId: input.parentPlatformCommentId
          },
          attributes: ["id"]
        });
        parentCommentId = parent ? parent.id : null;
      }
    }

    const created = await UGCPostComment.create({
      companyId,
      socialPostId: post.id,
      platform,
      platformCommentId: input.platformCommentId,
      content: input.content,
      authorUsername: input.authorUsername,
      authorDisplayName: input.authorDisplayName,
      parentCommentId,
      whatsappId: whatsapp.id,
      fromMe: input.fromMe,
      likeCount: input.likeCount,
      postedAt: input.postedAt,
      commentType: "neutral",
      sentiment: "neutral",
      // Anti-eco: nuestros propios comentarios no entran a la cola de respuesta
      autoReplyStatus: input.fromMe ? "skipped" : "pending",
      metadata: { source: "on_demand_sync" }
    } as unknown as UGCPostComment);

    localIdByPlatformId.set(input.platformCommentId, created.id);
    result.newComments += 1;
  };

  // ─── Facebook ───────────────────────────────────────────────────────────
  if (pageId) {
    const account = await ensureAccount("facebook", pageId);

    const postsResponse = await graphGet<GraphListResponse<FBPost>>(
      `${GRAPH_API_BASE}/${pageId}/posts`,
      {
        fields: "id,message,permalink_url,created_time,full_picture",
        limit: POSTS_LIMIT,
        access_token: token
      }
    );

    const posts = postsResponse.data || [];
    for (const fbPost of posts) {
      const post = await upsertPost(account, "facebook", fbPost.id, {
        caption: fbPost.message,
        permalink: fbPost.permalink_url,
        thumbnailUrl: fbPost.full_picture,
        publishedAt: parseDate(fbPost.created_time)
      });
      result.postsSynced += 1;

      const commentsResponse = await graphGet<GraphListResponse<FBComment>>(
        `${GRAPH_API_BASE}/${fbPost.id}/comments`,
        {
          filter: "stream",
          fields: "id,message,from,created_time,like_count,parent",
          limit: COMMENTS_LIMIT,
          access_token: token
        }
      );

      const comments = commentsResponse.data || [];
      for (const fbComment of comments) {
        const parentId =
          fbComment.parent?.id && fbComment.parent.id !== fbPost.id
            ? fbComment.parent.id
            : undefined;

        await upsertComment(post, "facebook", {
          platformCommentId: fbComment.id,
          content: fbComment.message || "",
          authorUsername: fbComment.from?.name || "Usuario de Facebook",
          authorDisplayName: fbComment.from?.name,
          postedAt: parseDate(fbComment.created_time),
          likeCount: fbComment.like_count || 0,
          fromMe: !!fbComment.from?.id && fbComment.from.id === pageId,
          parentPlatformCommentId: parentId
        });
      }
    }
  }

  // ─── Instagram ──────────────────────────────────────────────────────────
  if (igId) {
    const account = await ensureAccount("instagram", igId);

    const mediaResponse = await graphGet<GraphListResponse<IGMedia>>(
      `${GRAPH_API_BASE}/${igId}/media`,
      {
        fields: "id,caption,permalink,timestamp,thumbnail_url,media_url",
        limit: POSTS_LIMIT,
        access_token: token
      }
    );

    const medias = mediaResponse.data || [];
    for (const media of medias) {
      const post = await upsertPost(account, "instagram", media.id, {
        caption: media.caption,
        permalink: media.permalink,
        thumbnailUrl: media.thumbnail_url || media.media_url,
        publishedAt: parseDate(media.timestamp)
      });
      result.postsSynced += 1;

      const commentsResponse = await graphGet<GraphListResponse<IGComment>>(
        `${GRAPH_API_BASE}/${media.id}/comments`,
        {
          fields:
            "id,text,from,username,timestamp,like_count," +
            "replies{id,text,from,username,timestamp,like_count}",
          limit: COMMENTS_LIMIT,
          access_token: token
        }
      );

      const igToInput = (c: IGComment, parentId?: string): CommentUpsertInput => ({
        platformCommentId: c.id,
        content: c.text || "",
        authorUsername: c.username || c.from?.name || "Usuario de Instagram",
        authorDisplayName: c.from?.name || c.username,
        postedAt: parseDate(c.timestamp),
        likeCount: c.like_count || 0,
        fromMe: !!c.from?.id && c.from.id === igId,
        parentPlatformCommentId: parentId
      });

      const comments = commentsResponse.data || [];
      for (const igComment of comments) {
        await upsertComment(post, "instagram", igToInput(igComment));

        const replies = igComment.replies?.data || [];
        for (const reply of replies) {
          await upsertComment(post, "instagram", igToInput(reply, igComment.id));
        }
      }
    }
  }

  // Tiempo real: resumen de sincronización
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-fb-comment-sync`, {
    action: "sync_completed",
    whatsappId: whatsapp.id,
    ...result
  });

  logger.info(
    `[SocialComments] Sync completado (company ${companyId}, whatsapp ${whatsappId}): ` +
      `${result.postsSynced} posts, ${result.commentsSynced} comentarios, ${result.newComments} nuevos`
  );

  return result;
};

export default SyncPostCommentsService;
