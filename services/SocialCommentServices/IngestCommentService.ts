/**
 * IngestCommentService — Módulo Comentarios FB/IG (GAP 2).
 *
 * Procesa UN evento de comentario normalizado proveniente del webhook Meta
 * (campo 'feed' de Facebook o 'comments' de Instagram):
 *
 *   webhook → resolver conexión Whatsapp → anti-eco → dedup ledger →
 *   upsert UGCSocialAccount/UGCSocialPost → persistir UGCPostComment →
 *   emitir Socket.IO → encolar CommentResponderQueue si modo ≠ manual.
 *
 * Reglas:
 *   - BD SAGRADA: verb 'remove' marca isDeleted=true (NUNCA destroy).
 *   - Anti-eco: from.id === pageOrIgId → fromMe=true, se persiste pero
 *     NO se encola respuesta automática (autoReplyStatus='skipped').
 *   - Dedup: InboundEventLedger con eventKey `meta_comment:{verb}:{commentId}`
 *     → duplicado = return silencioso sin side effects.
 */
import { CreationAttributes } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
import ResolveResponseModeService from "./ResolveResponseModeService";
import getCommentAccessToken from "./getCommentAccessToken";
import { toSocialCommentDTO, SOCIAL_COMMENT_SOCKET_EVENT } from "./dto";
import { getIO } from "../../libs/socket";
import { add as addQueueJob } from "../../queues";
import logger from "../../utils/logger";
import axios from "axios";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";

/**
 * Obtiene descripción + imagen (+ permalink) del post desde la Graph API para
 * que la bandeja muestre de qué publicación es el comentario. Best-effort: si
 * falla (post borrado, token sin permiso, timeout), devuelve {} y el post queda
 * como estaba. No bloquea el 200 del webhook (la ingesta es fire-and-forget).
 */
const fetchPostDetails = async (
  platform: SocialCommentPlatform,
  postExternalId: string,
  token: string
): Promise<{ caption?: string; thumbnailUrl?: string; permalink?: string }> => {
  if (!token || !postExternalId) return {};
  try {
    const fields =
      platform === "instagram"
        ? "caption,permalink,thumbnail_url,media_url"
        : "message,permalink_url,full_picture";
    const { data } = await axios.get(`${GRAPH_API_BASE}/${postExternalId}`, {
      params: { fields, access_token: token },
      timeout: 8000
    });
    if (platform === "instagram") {
      return {
        caption: data?.caption,
        thumbnailUrl: data?.thumbnail_url || data?.media_url,
        permalink: data?.permalink
      };
    }
    return {
      caption: data?.message,
      thumbnailUrl: data?.full_picture,
      permalink: data?.permalink_url
    };
  } catch (err: any) {
    logger.warn(
      `[IngestComment] No se pudieron obtener detalles del post ${postExternalId} (${platform}): ${err?.message}`
    );
    return {};
  }
};

export type SocialCommentVerb = "add" | "edited" | "remove" | "hide" | "unhide";
export type SocialCommentPlatform = "facebook" | "instagram";

export interface NormalizedCommentEvent {
  /** Opcional: si el caller ya conoce la company, refuerza el filtro. */
  companyId?: number;
  platform: SocialCommentPlatform;
  /** FB: page id (entry.id) | IG: instagram business account id (entry.id). */
  pageOrIgId: string;
  verb: SocialCommentVerb;
  commentId: string;
  parentExternalId?: string | null;
  postExternalId: string;
  text: string;
  fromId: string;
  fromName: string;
  fromAvatar?: string | null;
  /** Unix seconds, unix ms o ISO string. */
  createdTime?: number | string | null;
  permalink?: string | null;
}

const parsePostedAt = (createdTime?: number | string | null): Date => {
  if (createdTime === null || createdTime === undefined) return new Date();
  if (typeof createdTime === "number") {
    // Meta envía unix seconds; tolerar ms por si el caller ya convirtió
    return new Date(createdTime < 1e12 ? createdTime * 1000 : createdTime);
  }
  const parsed = new Date(createdTime);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/** Resuelve la conexión Whatsapp dueña de la página FB o cuenta IG. */
const resolveConnection = async (
  event: NormalizedCommentEvent
): Promise<Whatsapp | null> => {
  const baseWhere: Record<string, unknown> =
    event.platform === "instagram"
      ? { instagramBusinessAccountId: event.pageOrIgId }
      : { facebookPageUserId: event.pageOrIgId };

  if (event.companyId) {
    baseWhere.companyId = event.companyId;
  }

  return Whatsapp.findOne({ where: baseWhere });
};

/** Upsert de la cuenta social (página FB / cuenta IG) ligada a la company. */
const upsertSocialAccount = async (
  event: NormalizedCommentEvent,
  whatsapp: Whatsapp
): Promise<UGCSocialAccount> => {
  const companyId = whatsapp.companyId;

  const existing = await UGCSocialAccount.findOne({
    where: {
      companyId,
      platform: event.platform,
      platformAccountId: event.pageOrIgId
    }
  });
  if (existing) return existing;

  const payload = {
    companyId,
    platform: event.platform,
    platformAccountId: event.pageOrIgId,
    username: whatsapp.name || event.pageOrIgId,
    displayName: whatsapp.name || null,
    // El token operativo vive en Whatsapps.pageAccessToken; aquí solo
    // referencia para cumplir NOT NULL del modelo UGC.
    accessToken: getCommentAccessToken(whatsapp) || "",
    status: "active",
    metadata: { source: "comment_ingest", whatsappId: whatsapp.id }
  };

  return UGCSocialAccount.create(
    payload as unknown as CreationAttributes<UGCSocialAccount>
  );
};

/** Upsert del post padre del comentario. */
const upsertSocialPost = async (
  event: NormalizedCommentEvent,
  whatsapp: Whatsapp,
  account: UGCSocialAccount
): Promise<UGCSocialPost> => {
  const companyId = whatsapp.companyId;

  const existing = await UGCSocialPost.findOne({
    where: {
      companyId,
      platform: event.platform,
      platformPostId: event.postExternalId
    }
  });

  // Post ya existente pero sin descripción NI imagen (p.ej. creado por un webhook
  // anterior a este fix): completarlo una sola vez con los datos de la Graph API.
  if (existing) {
    if (!existing.caption && !existing.thumbnailUrl) {
      const details = await fetchPostDetails(
        event.platform,
        event.postExternalId,
        getCommentAccessToken(whatsapp) || ""
      );
      if (details.caption || details.thumbnailUrl || details.permalink) {
        const meta = { ...((existing.metadata as Record<string, unknown>) || {}) };
        if (details.permalink && !meta.permalink) meta.permalink = details.permalink;
        await existing.update({
          ...(details.caption ? { caption: details.caption } : {}),
          ...(details.thumbnailUrl ? { thumbnailUrl: details.thumbnailUrl } : {}),
          metadata: meta
        } as Partial<UGCSocialPost>);
      }
    }
    return existing;
  }

  // Post nuevo: obtener descripción + imagen del post para identificarlo en la bandeja.
  const details = await fetchPostDetails(
    event.platform,
    event.postExternalId,
    getCommentAccessToken(whatsapp) || ""
  );
  const permalink = details.permalink || event.permalink;

  const payload = {
    companyId,
    socialAccountId: account.id,
    platformPostId: event.postExternalId,
    platform: event.platform,
    postType: "feed",
    status: "published",
    publishedAt: parsePostedAt(event.createdTime),
    ...(details.caption ? { caption: details.caption } : {}),
    ...(details.thumbnailUrl ? { thumbnailUrl: details.thumbnailUrl } : {}),
    metadata: {
      whatsappId: whatsapp.id,
      ...(permalink ? { permalink } : {}),
      source: "comment_ingest"
    }
  };

  return UGCSocialPost.create(
    payload as unknown as CreationAttributes<UGCSocialPost>
  );
};

/** Emite el DTO del comentario por Socket.IO (tolerante a IO no inicializado). */
const emitCommentEvent = (companyId: number, comment: UGCPostComment): void => {
  try {
    const io = getIO();
    io.of(String(companyId)).emit(
      SOCIAL_COMMENT_SOCKET_EVENT(companyId),
      toSocialCommentDTO(comment)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[IngestComment] Socket.IO no disponible para emitir comentario ${comment.id}: ${message}`
    );
  }
};

/**
 * Procesa un evento de comentario normalizado.
 * Devuelve el UGCPostComment afectado o null si se descartó (duplicado,
 * conexión desconocida, comentario inexistente para verbs de mutación).
 */
const IngestCommentService = async (
  event: NormalizedCommentEvent
): Promise<UGCPostComment | null> => {
  if (!event.commentId || !event.postExternalId || !event.pageOrIgId) {
    logger.warn(
      `[IngestComment] Evento incompleto descartado (platform=${event.platform}, verb=${event.verb})`
    );
    return null;
  }

  // 1. Resolver conexión dueña de la página/cuenta
  const whatsapp = await resolveConnection(event);
  if (!whatsapp) {
    logger.warn(
      `[IngestComment] Sin conexión Whatsapp para ${event.platform} id=${event.pageOrIgId} — evento ignorado`
    );
    return null;
  }
  const companyId = whatsapp.companyId;

  // 2. Anti-eco: comentarios publicados por la propia página/cuenta
  const fromMe = event.fromId === event.pageOrIgId;

  // 3. Dedup a nivel sistema (UNIQUE companyId+eventKey)
  const ledger = await InboundEventLedgerService.registerOrDrop({
    companyId,
    provider: "meta_comment",
    eventKey: `${event.verb}:${event.commentId}`,
    providerMessageId: event.commentId,
    payload: event
  });
  if (!ledger.accepted) {
    // Duplicado o error de ledger → salir sin side effects (conservador)
    return null;
  }

  try {
    // 4. Upsert cuenta social + post padre
    const account = await upsertSocialAccount(event, whatsapp);
    const post = await upsertSocialPost(event, whatsapp, account);

    // 5. Persistir/actualizar el comentario según verb
    let comment = await UGCPostComment.findOne({
      where: { companyId, platformCommentId: event.commentId }
    });

    if (event.verb === "remove") {
      if (!comment) {
        logger.info(
          `[IngestComment] remove de comentario desconocido ${event.commentId} — ignorado`
        );
        await InboundEventLedgerService.markProcessed(ledger.id);
        return null;
      }
      // BD SAGRADA: soft delete, nunca destroy
      comment.isDeleted = true;
      await comment.save();
    } else if (event.verb === "hide" || event.verb === "unhide") {
      if (!comment) {
        logger.info(
          `[IngestComment] ${event.verb} de comentario desconocido ${event.commentId} — ignorado`
        );
        await InboundEventLedgerService.markProcessed(ledger.id);
        return null;
      }
      comment.isHidden = event.verb === "hide";
      await comment.save();
    } else if (event.verb === "edited" && comment) {
      comment.content = event.text || comment.content;
      await comment.save();
    } else {
      // verb 'add' (o 'edited' de un comentario que aún no teníamos)
      if (comment) {
        // Re-entrega con verb distinto ya registrada — refrescar contenido
        comment.content = event.text || comment.content;
        await comment.save();
      } else {
        // Resolver padre (FB manda parent_id = post_id en comentarios raíz)
        let parentCommentId: number | null = null;
        if (
          event.parentExternalId &&
          event.parentExternalId !== event.commentId &&
          event.parentExternalId !== event.postExternalId
        ) {
          const parent = await UGCPostComment.findOne({
            where: { companyId, platformCommentId: event.parentExternalId }
          });
          if (parent) parentCommentId = parent.id;
        }

        const payload = {
          companyId,
          socialPostId: post.id,
          platformCommentId: event.commentId,
          content: event.text || "",
          authorUsername: event.fromName || "Usuario",
          authorDisplayName: event.fromName || null,
          authorProfileImageUrl: event.fromAvatar || null,
          parentCommentId,
          platform: event.platform,
          whatsappId: whatsapp.id,
          fromMe,
          postedAt: parsePostedAt(event.createdTime),
          commentType: "neutral",
          sentiment: "neutral",
          autoReplyStatus: fromMe ? "skipped" : "pending",
          metadata: {
            authorExternalId: event.fromId,
            ...(event.permalink ? { permalink: event.permalink } : {})
          }
        };

        comment = await UGCPostComment.create(
          payload as unknown as CreationAttributes<UGCPostComment>
        );
      }
    }

    // 6. Tiempo real para el inbox
    emitCommentEvent(companyId, comment);

    // 7. Encolar respuesta automática solo para comentarios nuevos ajenos
    if (event.verb === "add" && !fromMe) {
      const resolved = await ResolveResponseModeService(
        companyId,
        whatsapp.id,
        post.id
      );
      if (resolved.mode !== "manual") {
        await addQueueJob("CommentResponder", {
          commentId: comment.id,
          companyId
        });
        logger.info(
          `[IngestComment] Comentario ${comment.id} encolado en CommentResponderQueue ` +
            `(mode=${resolved.mode}, scope=${resolved.scope}, company=${companyId})`
        );
      }
    }

    await InboundEventLedgerService.markProcessed(ledger.id);
    return comment;
  } catch (err) {
    await InboundEventLedgerService.markError(ledger.id, err);
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `[IngestComment] Error procesando ${event.platform}:${event.verb}:${event.commentId} ` +
        `(company=${companyId}): ${message}`
    );
    return null;
  }
};

export default IngestCommentService;
