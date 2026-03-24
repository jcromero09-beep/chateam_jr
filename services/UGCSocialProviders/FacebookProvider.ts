/**
 * FacebookProvider — Publicacion y metricas via Facebook Graph API (Pages).
 * Soporta posts con texto, imagen, video y metricas de pagina.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

type FBMediaType = "text" | "photo" | "video" | "link";

interface PublishPostRequest {
  pageAccessToken: string;
  pageId: string;
  message: string;
  mediaUrl?: string;
  mediaType?: FBMediaType;
  linkUrl?: string;
}

interface PublishResult {
  postId: string;
  videoId?: string;
}

interface PostMetrics {
  impressions: number;
  reach: number;
  engagedUsers: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
}

interface PageMetrics {
  pageViews: number;
  pageFans: number;
  pageEngagement: number;
  newFans: number;
}

interface CommentData {
  id: string;
  message: string;
  fromName: string;
  fromId: string;
  createdTime: string;
  likeCount: number;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const FB_API_BASE = "https://graph.facebook.com/v22.0";
const TIMEOUT_SUBMIT = 30_000;
const TIMEOUT_UPLOAD = 120_000; // 2 min para video uploads
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOnRateLimit<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      if (axiosErr?.response?.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn(
          `[FacebookProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[FacebookProvider] Max retries alcanzado en ${context}`
  );
}

function extractApiError(error: unknown): string {
  const axiosErr = error as AxiosError<{
    error?: { message?: string; code?: number; error_subcode?: number };
  }>;
  if (axiosErr?.response?.data?.error?.message) {
    return axiosErr.response.data.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

// ---------------------------------------------------------------------------
// Funciones de publicacion
// ---------------------------------------------------------------------------

/**
 * Publica un post en una pagina de Facebook.
 * Soporta texto, foto, video y link.
 */
async function publishPost(
  params: PublishPostRequest
): Promise<PublishResult> {
  const { pageAccessToken, pageId, message, mediaUrl, mediaType, linkUrl } =
    params;

  const effectiveType = mediaType || "text";

  logger.info(
    `[FacebookProvider] Publicando post: pageId=${pageId} type=${effectiveType}`
  );

  try {
    if (effectiveType === "photo" && mediaUrl) {
      return await publishPhoto(pageAccessToken, pageId, mediaUrl, message);
    }

    if (effectiveType === "video" && mediaUrl) {
      return await publishVideo(pageAccessToken, pageId, mediaUrl, message);
    }

    // Post de texto o con link
    return retryOnRateLimit(async () => {
      const body: Record<string, string> = {
        message,
        access_token: pageAccessToken
      };

      if (linkUrl) body.link = linkUrl;

      const response = await axios.post(
        `${FB_API_BASE}/${pageId}/feed`,
        body,
        { timeout: TIMEOUT_SUBMIT }
      );

      const postId: string = response.data.id;

      logger.info(
        `[FacebookProvider] Post publicado: postId=${postId}`
      );

      return { postId };
    }, "publishTextPost");
  } catch (error: unknown) {
    const errorMsg = extractApiError(error);
    logger.error(
      `[FacebookProvider] Error publicando post: ${errorMsg}`
    );
    throw new Error(`Facebook publish error: ${errorMsg}`);
  }
}

/**
 * Publica una foto en la pagina.
 */
async function publishPhoto(
  pageAccessToken: string,
  pageId: string,
  photoUrl: string,
  caption?: string
): Promise<PublishResult> {
  logger.info(
    `[FacebookProvider] Publicando foto: pageId=${pageId}`
  );

  return retryOnRateLimit(async () => {
    const body: Record<string, string> = {
      url: photoUrl,
      access_token: pageAccessToken
    };

    if (caption) body.caption = caption;

    const response = await axios.post(
      `${FB_API_BASE}/${pageId}/photos`,
      body,
      { timeout: TIMEOUT_SUBMIT }
    );

    const postId: string = response.data.post_id || response.data.id;

    logger.info(
      `[FacebookProvider] Foto publicada: postId=${postId}`
    );

    return { postId };
  }, "publishPhoto");
}

/**
 * Publica un video en la pagina.
 */
async function publishVideo(
  pageAccessToken: string,
  pageId: string,
  videoUrl: string,
  description?: string
): Promise<PublishResult> {
  logger.info(
    `[FacebookProvider] Publicando video: pageId=${pageId}`
  );

  return retryOnRateLimit(async () => {
    const body: Record<string, string> = {
      file_url: videoUrl,
      access_token: pageAccessToken
    };

    if (description) body.description = description;

    const response = await axios.post(
      `${FB_API_BASE}/${pageId}/videos`,
      body,
      { timeout: TIMEOUT_UPLOAD }
    );

    const videoId: string = response.data.id;

    logger.info(
      `[FacebookProvider] Video publicado: videoId=${videoId}`
    );

    return { postId: videoId, videoId };
  }, "publishVideo");
}

// ---------------------------------------------------------------------------
// Funciones de metricas
// ---------------------------------------------------------------------------

/**
 * Obtiene metricas de un post especifico.
 */
async function getPostMetrics(
  pageAccessToken: string,
  postId: string
): Promise<PostMetrics> {
  logger.info(
    `[FacebookProvider] Obteniendo metricas: postId=${postId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${FB_API_BASE}/${postId}/insights`,
      {
        params: {
          metric:
            "post_impressions,post_impressions_unique,post_engaged_users,post_reactions_by_type_total,post_clicks",
          access_token: pageAccessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const metricsMap: Record<string, number> = {};
    const dataArray = response.data.data as Array<{
      name: string;
      values: Array<{ value: number | Record<string, number> }>;
    }>;

    for (const metric of dataArray) {
      const val = metric.values[0]?.value;
      if (typeof val === "number") {
        metricsMap[metric.name] = val;
      } else if (typeof val === "object") {
        // post_reactions_by_type_total es un objeto
        metricsMap[metric.name] = Object.values(val).reduce(
          (sum, v) => sum + v,
          0
        );
      }
    }

    // Obtener comments y shares del post directamente
    const postResp = await axios.get(
      `${FB_API_BASE}/${postId}`,
      {
        params: {
          fields: "comments.summary(true),shares",
          access_token: pageAccessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const result: PostMetrics = {
      impressions: metricsMap.post_impressions || 0,
      reach: metricsMap.post_impressions_unique || 0,
      engagedUsers: metricsMap.post_engaged_users || 0,
      reactions: metricsMap.post_reactions_by_type_total || 0,
      comments: postResp.data.comments?.summary?.total_count || 0,
      shares: postResp.data.shares?.count || 0,
      clicks: metricsMap.post_clicks || 0
    };

    logger.info(
      `[FacebookProvider] Metricas postId=${postId}: ` +
        `reach=${result.reach} reactions=${result.reactions} shares=${result.shares}`
    );

    return result;
  }, "getPostMetrics");
}

/**
 * Obtiene metricas de la pagina.
 */
async function getPageMetrics(
  pageAccessToken: string,
  pageId: string,
  period: "day" | "week" | "days_28" = "day"
): Promise<PageMetrics> {
  logger.info(
    `[FacebookProvider] Obteniendo metricas de pagina: pageId=${pageId} period=${period}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${FB_API_BASE}/${pageId}/insights`,
      {
        params: {
          metric:
            "page_views_total,page_fans,page_engaged_users,page_fan_adds",
          period,
          access_token: pageAccessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const metricsMap: Record<string, number> = {};
    const dataArray = response.data.data as Array<{
      name: string;
      values: Array<{ value: number }>;
    }>;

    for (const metric of dataArray) {
      metricsMap[metric.name] = metric.values[0]?.value || 0;
    }

    const result: PageMetrics = {
      pageViews: metricsMap.page_views_total || 0,
      pageFans: metricsMap.page_fans || 0,
      pageEngagement: metricsMap.page_engaged_users || 0,
      newFans: metricsMap.page_fan_adds || 0
    };

    logger.info(
      `[FacebookProvider] Metricas pageId=${pageId}: ` +
        `fans=${result.pageFans} views=${result.pageViews} engagement=${result.pageEngagement}`
    );

    return result;
  }, "getPageMetrics");
}

/**
 * Obtiene comentarios de un post.
 */
async function getComments(
  pageAccessToken: string,
  postId: string,
  limit = 50
): Promise<CommentData[]> {
  logger.info(
    `[FacebookProvider] Obteniendo comentarios: postId=${postId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${FB_API_BASE}/${postId}/comments`,
      {
        params: {
          fields: "id,message,from,created_time,like_count",
          limit,
          access_token: pageAccessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const comments: CommentData[] = (
      response.data.data as Array<Record<string, unknown>>
    ).map((c) => ({
      id: c.id as string,
      message: (c.message as string) || "",
      fromName: (c.from as Record<string, string>)?.name || "",
      fromId: (c.from as Record<string, string>)?.id || "",
      createdTime: c.created_time as string,
      likeCount: (c.like_count as number) || 0
    }));

    logger.info(
      `[FacebookProvider] ${comments.length} comentarios encontrados para postId=${postId}`
    );

    return comments;
  }, "getComments");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  publishPost,
  publishPhoto,
  publishVideo,
  getPostMetrics,
  getPageMetrics,
  getComments
};
export type {
  PublishPostRequest,
  PublishResult,
  PostMetrics,
  PageMetrics,
  CommentData,
  FBMediaType
};

export default {
  publishPost,
  publishPhoto,
  publishVideo,
  getPostMetrics,
  getPageMetrics,
  getComments
};
