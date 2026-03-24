/**
 * Service: CommentReplyExecutor
 * Ejecuta acciones sobre comentarios usando la Graph API v24.0.
 * Cada funcion maneja un tipo de accion: responder, like, ocultar, eliminar, bloquear.
 * Todas usan axios y lanzan AppError en caso de fallo.
 */

import axios from "axios";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";

interface GraphApiResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Responde a un comentario de Facebook con un mensaje publico.
 * POST /{commentId}/comments
 */
const replyToComment = async (
  commentId: string,
  message: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${commentId}/comments`,
      { message },
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Respuesta publica enviada a comentario ${commentId}`);
    return { success: true, id: response.data?.id };
  } catch (error: unknown) {
    const message_ = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error respondiendo a ${commentId}: ${message_}`);
    throw new AppError(`ERR_REPLY_TO_COMMENT: ${message_}`, 502);
  }
};

/**
 * Envia un mensaje privado al autor de un comentario.
 * POST /{commentId}/private_replies
 */
const sendPrivateReply = async (
  commentId: string,
  message: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${commentId}/private_replies`,
      { message },
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Respuesta privada enviada a comentario ${commentId}`);
    return { success: true, id: response.data?.id };
  } catch (error: unknown) {
    const message_ = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error enviando privado a ${commentId}: ${message_}`);
    throw new AppError(`ERR_PRIVATE_REPLY: ${message_}`, 502);
  }
};

/**
 * Da like a un comentario.
 * POST /{commentId}/likes
 */
const likeComment = async (
  commentId: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${commentId}/likes`,
      null,
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Like dado a comentario ${commentId}`);
    return { success: true };
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error dando like a ${commentId}: ${message}`);
    throw new AppError(`ERR_LIKE_COMMENT: ${message}`, 502);
  }
};

/**
 * Oculta un comentario.
 * POST /{commentId}?is_hidden=true
 */
const hideComment = async (
  commentId: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${commentId}`,
      { is_hidden: true },
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Comentario ${commentId} ocultado`);
    return { success: true };
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error ocultando ${commentId}: ${message}`);
    throw new AppError(`ERR_HIDE_COMMENT: ${message}`, 502);
  }
};

/**
 * Elimina un comentario.
 * DELETE /{commentId}
 */
const deleteComment = async (
  commentId: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    await axios.delete(
      `${GRAPH_API_BASE}/${commentId}`,
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Comentario ${commentId} eliminado`);
    return { success: true };
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error eliminando ${commentId}: ${message}`);
    throw new AppError(`ERR_DELETE_COMMENT: ${message}`, 502);
  }
};

/**
 * Bloquea a un usuario de la pagina.
 * POST /{pageId}/blocked con user[]={userId}
 */
const blockCommenter = async (
  pageId: string,
  userId: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${pageId}/blocked`,
      null,
      {
        params: {
          "user[]": userId,
          access_token: accessToken
        }
      }
    );

    logger.info(`[CommentReplyExecutor] Usuario ${userId} bloqueado de pagina ${pageId}`);
    return { success: true };
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error bloqueando ${userId} de ${pageId}: ${message}`);
    throw new AppError(`ERR_BLOCK_COMMENTER: ${message}`, 502);
  }
};

/**
 * Responde a un comentario de Instagram.
 * POST /{commentId}/replies
 */
const replyToIGComment = async (
  commentId: string,
  message: string,
  accessToken: string
): Promise<GraphApiResult> => {
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${commentId}/replies`,
      { message },
      { params: { access_token: accessToken } }
    );

    logger.info(`[CommentReplyExecutor] Respuesta IG enviada a comentario ${commentId}`);
    return { success: true, id: response.data?.id };
  } catch (error: unknown) {
    const message_ = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[CommentReplyExecutor] Error respondiendo IG a ${commentId}: ${message_}`);
    throw new AppError(`ERR_REPLY_IG_COMMENT: ${message_}`, 502);
  }
};

export {
  replyToComment,
  sendPrivateReply,
  likeComment,
  hideComment,
  deleteComment,
  blockCommenter,
  replyToIGComment,
  GraphApiResult
};
