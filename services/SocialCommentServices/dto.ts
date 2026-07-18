/**
 * DTOs compartidos del módulo de Comentarios FB/IG.
 * Contrato único entre backend (API REST + Socket.IO) y frontend
 * (frontend/src/services/socialCommentService.ts).
 *
 * NO cambiar nombres de campos sin actualizar el frontend.
 */
import UGCPostComment from "../../models/UGCPostComment";
import UGCSocialPost from "../../models/UGCSocialPost";

export interface SocialCommentDTO {
  id: number;
  socialPostId: number;
  externalCommentId: string;
  text: string;
  authorName: string;
  authorAvatarUrl: string | null;
  platform: string;
  parentCommentId: number | null;
  likeCount: number;
  isHidden: boolean;
  isDeleted: boolean;
  fromMe: boolean;
  autoReplyStatus: string;
  replySentText: string | null;
  sentiment: string;
  commentType: string;
  createdAt: string;
  replies?: SocialCommentDTO[];
}

export interface SocialPostDTO {
  id: number;
  platform: string;
  caption: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  pendingComments: number;
  totalComments: number;
  whatsappId: number | null;
}

export const toSocialCommentDTO = (c: UGCPostComment): SocialCommentDTO => ({
  id: c.id,
  socialPostId: c.socialPostId,
  externalCommentId: c.platformCommentId,
  text: c.content,
  authorName: c.authorDisplayName || c.authorUsername,
  authorAvatarUrl: c.authorProfileImageUrl || null,
  platform: c.platform,
  parentCommentId: c.parentCommentId ?? null,
  likeCount: c.likeCount,
  isHidden: c.isHidden,
  isDeleted: c.isDeleted,
  fromMe: c.fromMe,
  autoReplyStatus: c.autoReplyStatus,
  replySentText: c.autoReplyContent || null,
  sentiment: c.sentiment,
  commentType: c.commentType,
  createdAt: (c.postedAt || c.createdAt).toISOString(),
  ...(c.replies && c.replies.length > 0
    ? { replies: c.replies.map(toSocialCommentDTO) }
    : {})
});

/**
 * pendingComments y totalComments se calculan en la capa de servicio
 * (COUNT por autoReplyStatus='pending' y total de UGCPostComments).
 * whatsappId se resuelve vía metadata.whatsappId del post (lo escribe la ingesta)
 * o se pasa explícito por el caller.
 */
export const toSocialPostDTO = (
  p: UGCSocialPost,
  counts: { pendingComments: number; totalComments: number },
  whatsappId?: number | null
): SocialPostDTO => {
  const meta = (p.metadata || {}) as Record<string, unknown>;
  return {
    id: p.id,
    platform: p.platform,
    caption: p.caption || null,
    mediaUrl: p.thumbnailUrl || p.mediaUrl || null,
    permalink: typeof meta.permalink === "string" ? meta.permalink : null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    pendingComments: counts.pendingComments,
    totalComments: counts.totalComments,
    whatsappId:
      whatsappId ??
      (typeof meta.whatsappId === "number" ? meta.whatsappId : null)
  };
};

/** Evento Socket.IO de tiempo real — el frontend espera el DTO completo. */
export const SOCIAL_COMMENT_SOCKET_EVENT = (companyId: number): string =>
  `company-${companyId}-fb-comment`;
