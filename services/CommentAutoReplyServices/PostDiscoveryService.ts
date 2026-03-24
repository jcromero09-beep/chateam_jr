/**
 * Service: PostDiscoveryService
 * Descubre posts y comentarios de paginas de Facebook e Instagram
 * usando la Graph API v24.0.
 */

import axios from "axios";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";

interface FacebookPost {
  id: string;
  message?: string;
  picture?: string;
  permalink_url?: string;
  created_time?: string;
}

interface FacebookComment {
  id: string;
  message: string;
  from?: { id: string; name: string };
  created_time?: string;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_url?: string;
  timestamp?: string;
  permalink?: string;
}

/**
 * Obtiene los posts de una pagina de Facebook.
 */
const getPagePosts = async (
  pageId: string,
  accessToken: string,
  limit: number = 25
): Promise<FacebookPost[]> => {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${pageId}/posts`, {
      params: {
        fields: "id,message,picture,permalink_url,created_time",
        limit,
        access_token: accessToken
      }
    });

    return response.data?.data || [];
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[PostDiscovery] Error obteniendo posts de pagina ${pageId}: ${message}`);
    throw new AppError(`ERR_GRAPH_API_GET_POSTS: ${message}`, 502);
  }
};

/**
 * Obtiene los comentarios de un post de Facebook.
 */
const getPostComments = async (
  postId: string,
  accessToken: string,
  limit: number = 200
): Promise<FacebookComment[]> => {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${postId}/comments`, {
      params: {
        fields: "id,message,from,created_time",
        order: "reverse_chronological",
        limit,
        access_token: accessToken
      }
    });

    return response.data?.data || [];
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[PostDiscovery] Error obteniendo comentarios del post ${postId}: ${message}`);
    throw new AppError(`ERR_GRAPH_API_GET_COMMENTS: ${message}`, 502);
  }
};

/**
 * Obtiene los media (posts) de una cuenta de Instagram.
 */
const getInstagramMedia = async (
  igUserId: string,
  accessToken: string,
  limit: number = 25
): Promise<InstagramMedia[]> => {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${igUserId}/media`, {
      params: {
        fields: "id,caption,media_url,timestamp,permalink",
        limit,
        access_token: accessToken
      }
    });

    return response.data?.data || [];
  } catch (error: unknown) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : String(error);
    logger.error(`[PostDiscovery] Error obteniendo media de IG ${igUserId}: ${message}`);
    throw new AppError(`ERR_GRAPH_API_GET_IG_MEDIA: ${message}`, 502);
  }
};

export { getPagePosts, getPostComments, getInstagramMedia };
