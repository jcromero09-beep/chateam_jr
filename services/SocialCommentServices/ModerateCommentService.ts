/**
 * Service: ModerateCommentService
 * Moderación de comentarios FB/IG:
 * - Like / quitar like: SOLO Facebook (IG no soporta like de comentarios vía API)
 * - Ocultar / mostrar: FB → POST /{id} {is_hidden}, IG → POST /{id}?hide=
 * Reutiliza CommentReplyExecutor donde aplica; el resto va con axios directo
 * a Graph API v24.0. Actualiza isHidden en BD + emite Socket.IO.
 */

import axios from "axios";
import UGCPostComment from "../../models/UGCPostComment";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import getCommentAccessToken from "./getCommentAccessToken";
import {
  likeComment,
  hideComment
} from "../CommentAutoReplyServices/CommentReplyExecutor";
import {
  SocialCommentDTO,
  toSocialCommentDTO,
  SOCIAL_COMMENT_SOCKET_EVENT
} from "./dto";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";
const GRAPH_TIMEOUT_MS = 15000;

interface ModerateLikeRequest {
  companyId: number;
  commentId: number;
  add: boolean;
}

interface ModerateHideRequest {
  companyId: number;
  commentId: number;
  hidden: boolean;
}

interface LoadedComment {
  comment: UGCPostComment;
  token: string;
}

const graphErrorMessage = (error: unknown): string =>
  axios.isAxiosError(error)
    ? error.response?.data?.error?.message || error.message
    : String(error);

/** Carga comentario + token de la conexión, validando companyId. */
const loadCommentWithToken = async (
  companyId: number,
  commentId: number
): Promise<LoadedComment> => {
  const comment = await UGCPostComment.findOne({
    where: { id: commentId, companyId },
    include: [{ model: Whatsapp, as: "whatsapp", required: false }]
  });

  if (!comment) {
    throw new AppError("ERR_COMMENT_NOT_FOUND: Comentario no encontrado", 404);
  }

  if (comment.isDeleted) {
    throw new AppError(
      "ERR_COMMENT_DELETED: El comentario fue eliminado",
      400
    );
  }

  const whatsapp =
    comment.whatsapp ||
    (comment.whatsappId
      ? await Whatsapp.findOne({
          where: { id: comment.whatsappId, companyId }
        })
      : null);

  const token = whatsapp ? getCommentAccessToken(whatsapp) : null;

  if (!token) {
    throw new AppError(
      "ERR_NO_TOKEN: La conexión no tiene Page Access Token configurado",
      400
    );
  }

  return { comment, token };
};

const emitCommentUpdate = (companyId: number, dto: SocialCommentDTO): void => {
  const io = getIO();
  io.of(String(companyId)).emit(SOCIAL_COMMENT_SOCKET_EVENT(companyId), dto);
};

/**
 * Like / quitar like a un comentario. SOLO Facebook.
 */
export const setLike = async ({
  companyId,
  commentId,
  add
}: ModerateLikeRequest): Promise<SocialCommentDTO> => {
  const { comment, token } = await loadCommentWithToken(companyId, commentId);

  if (comment.platform !== "facebook") {
    throw new AppError(
      "ERR_IG_LIKE_UNSUPPORTED: Instagram no soporta like de comentarios vía API",
      400
    );
  }

  if (add) {
    await likeComment(comment.platformCommentId, token);
  } else {
    try {
      await axios.delete(
        `${GRAPH_API_BASE}/${comment.platformCommentId}/likes`,
        {
          params: { access_token: token },
          timeout: GRAPH_TIMEOUT_MS
        }
      );
    } catch (error: unknown) {
      const msg = graphErrorMessage(error);
      logger.error(
        `[SocialComments] Error quitando like a ${comment.platformCommentId}: ${msg}`
      );
      throw new AppError(`ERR_UNLIKE_COMMENT: ${msg}`, 502);
    }
  }

  // Registrar en metadata (no hay columna dedicada — BD SAGRADA, solo update)
  comment.metadata = {
    ...(comment.metadata || {}),
    likedByPage: add
  };
  await comment.save();

  const dto = toSocialCommentDTO(comment);
  emitCommentUpdate(companyId, dto);

  logger.info(
    `[SocialComments] ${add ? "Like" : "Unlike"} aplicado (company ${companyId}, comment ${comment.id})`
  );

  return dto;
};

/**
 * Ocultar / mostrar un comentario.
 * FB: POST /{id} { is_hidden } — IG: POST /{id}?hide=true|false
 */
export const setHidden = async ({
  companyId,
  commentId,
  hidden
}: ModerateHideRequest): Promise<SocialCommentDTO> => {
  const { comment, token } = await loadCommentWithToken(companyId, commentId);

  if (comment.platform === "facebook") {
    if (hidden) {
      // Reutiliza el executor existente (POST /{id} { is_hidden: true })
      await hideComment(comment.platformCommentId, token);
    } else {
      try {
        await axios.post(
          `${GRAPH_API_BASE}/${comment.platformCommentId}`,
          { is_hidden: false },
          {
            params: { access_token: token },
            timeout: GRAPH_TIMEOUT_MS
          }
        );
      } catch (error: unknown) {
        const msg = graphErrorMessage(error);
        logger.error(
          `[SocialComments] Error mostrando ${comment.platformCommentId}: ${msg}`
        );
        throw new AppError(`ERR_UNHIDE_COMMENT: ${msg}`, 502);
      }
    }
  } else if (comment.platform === "instagram") {
    // El executor no cubre IG hide → llamada Graph directa: POST /{id}?hide=
    try {
      await axios.post(`${GRAPH_API_BASE}/${comment.platformCommentId}`, null, {
        params: { hide: hidden, access_token: token },
        timeout: GRAPH_TIMEOUT_MS
      });
    } catch (error: unknown) {
      const msg = graphErrorMessage(error);
      logger.error(
        `[SocialComments] Error ${hidden ? "ocultando" : "mostrando"} IG ${comment.platformCommentId}: ${msg}`
      );
      throw new AppError(
        `ERR_${hidden ? "HIDE" : "UNHIDE"}_IG_COMMENT: ${msg}`,
        502
      );
    }
  } else {
    throw new AppError(
      "ERR_UNSUPPORTED_PLATFORM: Solo se soportan comentarios de Facebook e Instagram",
      400
    );
  }

  comment.isHidden = hidden;
  await comment.save();

  const dto = toSocialCommentDTO(comment);
  emitCommentUpdate(companyId, dto);

  logger.info(
    `[SocialComments] Comentario ${hidden ? "ocultado" : "mostrado"} (company ${companyId}, comment ${comment.id})`
  );

  return dto;
};
