/**
 * InstagramProvider — Publicacion y metricas via Instagram Graph API.
 * Soporta posts (imagen/video), stories y reels.
 * Flujo de publicacion: crear media container -> esperar procesamiento -> publicar.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | "STORIES";

interface PublishPostRequest {
  accessToken: string;
  igUserId: string;
  mediaUrl: string;
  caption?: string;
  mediaType: MediaType;
  coverUrl?: string;
  locationId?: string;
}

interface PublishResult {
  containerId: string;
  mediaId: string;
  permalink?: string;
}

interface PostMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

interface AccountMetrics {
  followers: number;
  following: number;
  mediaCount: number;
  profileViews?: number;
}

interface CommentData {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likeCount: number;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const IG_API_BASE = "https://graph.instagram.com/v21.0";
const TIMEOUT_SUBMIT = 30_000;
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;
const CONTAINER_POLL_INTERVAL = 5_000;
const CONTAINER_POLL_MAX_ATTEMPTS = 30; // 2.5 min max

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
        const retryAfter = Number(
          axiosErr.response.headers["retry-after"] || RETRY_DELAY_MS * attempt / 1000
        );
        const delay = retryAfter * 1000;
        logger.warn(
          `[InstagramProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[InstagramProvider] Max retries alcanzado en ${context}`
  );
}

function extractApiError(error: unknown): string {
  const axiosErr = error as AxiosError<{ error?: { message?: string } }>;
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
 * Publica un post (imagen o video) en Instagram.
 * Flujo: 1) Crear media container, 2) Esperar procesamiento, 3) Publicar.
 */
async function publishPost(
  params: PublishPostRequest
): Promise<PublishResult> {
  const { accessToken, igUserId, mediaUrl, caption, mediaType } = params;

  logger.info(
    `[InstagramProvider] Publicando post: type=${mediaType} user=${igUserId}`
  );

  try {
    // Paso 1: Crear media container
    const containerBody: Record<string, string> = {
      access_token: accessToken
    };

    if (mediaType === "IMAGE") {
      containerBody.image_url = mediaUrl;
    } else if (mediaType === "VIDEO") {
      containerBody.video_url = mediaUrl;
      containerBody.media_type = "VIDEO";
    } else if (mediaType === "REELS") {
      containerBody.video_url = mediaUrl;
      containerBody.media_type = "REELS";
      if (params.coverUrl) {
        containerBody.cover_url = params.coverUrl;
      }
    }

    if (caption) containerBody.caption = caption;
    if (params.locationId) containerBody.location_id = params.locationId;

    const containerResp = await retryOnRateLimit(
      () =>
        axios.post(`${IG_API_BASE}/${igUserId}/media`, containerBody, {
          timeout: TIMEOUT_SUBMIT
        }),
      "createContainer"
    );

    const containerId: string = containerResp.data.id;
    logger.info(
      `[InstagramProvider] Container creado: ${containerId}`
    );

    // Paso 2: Para videos/reels, esperar a que el container este listo
    if (mediaType === "VIDEO" || mediaType === "REELS") {
      let ready = false;
      for (let i = 0; i < CONTAINER_POLL_MAX_ATTEMPTS; i++) {
        await sleep(CONTAINER_POLL_INTERVAL);

        const statusResp = await axios.get(
          `${IG_API_BASE}/${containerId}`,
          {
            params: {
              fields: "status_code,status",
              access_token: accessToken
            },
            timeout: TIMEOUT_QUERY
          }
        );

        const statusCode: string = statusResp.data.status_code;
        logger.info(
          `[InstagramProvider] Container ${containerId} status: ${statusCode} (intento ${i + 1})`
        );

        if (statusCode === "FINISHED") {
          ready = true;
          break;
        }

        if (statusCode === "ERROR") {
          throw new Error(
            `[InstagramProvider] Container fallo: ${statusResp.data.status || "unknown error"}`
          );
        }
      }

      if (!ready) {
        throw new Error(
          `[InstagramProvider] Timeout esperando container ${containerId}`
        );
      }
    }

    // Paso 3: Publicar el container
    const publishResp = await retryOnRateLimit(
      () =>
        axios.post(
          `${IG_API_BASE}/${igUserId}/media_publish`,
          {
            creation_id: containerId,
            access_token: accessToken
          },
          { timeout: TIMEOUT_SUBMIT }
        ),
      "publishContainer"
    );

    const mediaId: string = publishResp.data.id;

    logger.info(
      `[InstagramProvider] Post publicado: mediaId=${mediaId}`
    );

    return { containerId, mediaId };
  } catch (error: unknown) {
    const message = extractApiError(error);
    logger.error(
      `[InstagramProvider] Error publicando post: ${message}`
    );
    throw new Error(`Instagram publish error: ${message}`);
  }
}

/**
 * Publica una story (imagen o video).
 */
async function publishStory(
  accessToken: string,
  igUserId: string,
  mediaUrl: string,
  isVideo = false
): Promise<PublishResult> {
  logger.info(
    `[InstagramProvider] Publicando story: user=${igUserId} isVideo=${isVideo}`
  );

  const containerBody: Record<string, string> = {
    access_token: accessToken,
    media_type: "STORIES"
  };

  if (isVideo) {
    containerBody.video_url = mediaUrl;
  } else {
    containerBody.image_url = mediaUrl;
  }

  return publishPost({
    accessToken,
    igUserId,
    mediaUrl,
    mediaType: "STORIES"
  });
}

/**
 * Publica un reel.
 */
async function publishReel(
  accessToken: string,
  igUserId: string,
  videoUrl: string,
  caption?: string,
  coverUrl?: string
): Promise<PublishResult> {
  logger.info(
    `[InstagramProvider] Publicando reel: user=${igUserId}`
  );

  return publishPost({
    accessToken,
    igUserId,
    mediaUrl: videoUrl,
    caption,
    mediaType: "REELS",
    coverUrl
  });
}

// ---------------------------------------------------------------------------
// Funciones de metricas
// ---------------------------------------------------------------------------

/**
 * Obtiene metricas de un post especifico.
 */
async function getPostMetrics(
  accessToken: string,
  mediaId: string
): Promise<PostMetrics> {
  logger.info(
    `[InstagramProvider] Obteniendo metricas: mediaId=${mediaId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${IG_API_BASE}/${mediaId}/insights`,
      {
        params: {
          metric: "impressions,reach,likes,comments,saved,shares",
          access_token: accessToken
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

    const result: PostMetrics = {
      impressions: metricsMap.impressions || 0,
      reach: metricsMap.reach || 0,
      likes: metricsMap.likes || 0,
      comments: metricsMap.comments || 0,
      saves: metricsMap.saved || 0,
      shares: metricsMap.shares || 0
    };

    logger.info(
      `[InstagramProvider] Metricas mediaId=${mediaId}: ` +
        `reach=${result.reach} likes=${result.likes} saves=${result.saves}`
    );

    return result;
  }, "getPostMetrics");
}

/**
 * Obtiene metricas de la cuenta de Instagram.
 */
async function getAccountMetrics(
  accessToken: string,
  igUserId: string
): Promise<AccountMetrics> {
  logger.info(
    `[InstagramProvider] Obteniendo metricas de cuenta: user=${igUserId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${IG_API_BASE}/${igUserId}`,
      {
        params: {
          fields: "followers_count,follows_count,media_count",
          access_token: accessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const data = response.data;

    const result: AccountMetrics = {
      followers: data.followers_count || 0,
      following: data.follows_count || 0,
      mediaCount: data.media_count || 0
    };

    logger.info(
      `[InstagramProvider] Cuenta user=${igUserId}: ` +
        `followers=${result.followers} posts=${result.mediaCount}`
    );

    return result;
  }, "getAccountMetrics");
}

/**
 * Obtiene comentarios de un post.
 */
async function getComments(
  accessToken: string,
  mediaId: string,
  limit = 50
): Promise<CommentData[]> {
  logger.info(
    `[InstagramProvider] Obteniendo comentarios: mediaId=${mediaId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${IG_API_BASE}/${mediaId}/comments`,
      {
        params: {
          fields: "id,text,username,timestamp,like_count",
          limit,
          access_token: accessToken
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const comments: CommentData[] = (
      response.data.data as Array<Record<string, unknown>>
    ).map((c) => ({
      id: c.id as string,
      text: c.text as string,
      username: c.username as string,
      timestamp: c.timestamp as string,
      likeCount: (c.like_count as number) || 0
    }));

    logger.info(
      `[InstagramProvider] ${comments.length} comentarios encontrados para mediaId=${mediaId}`
    );

    return comments;
  }, "getComments");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  publishPost,
  publishStory,
  publishReel,
  getPostMetrics,
  getAccountMetrics,
  getComments
};
export type {
  PublishPostRequest,
  PublishResult,
  PostMetrics,
  AccountMetrics,
  CommentData,
  MediaType
};

export default {
  publishPost,
  publishStory,
  publishReel,
  getPostMetrics,
  getAccountMetrics,
  getComments
};
