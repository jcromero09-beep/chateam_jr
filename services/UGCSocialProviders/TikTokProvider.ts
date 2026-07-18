/**
 * TikTokProvider — Publicacion y metricas via TikTok Content Posting API v2.
 * Flujo: initDirectPost -> upload video -> publishPost.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

type PrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY"
  | "FOLLOWER_OF_CREATOR";

interface InitDirectPostRequest {
  accessToken: string;
  videoUrl: string;
  title?: string;
  privacyLevel: PrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}

interface InitDirectPostResponse {
  publishId: string;
  uploadUrl?: string;
  status: string;
}

interface PublishResult {
  publishId: string;
  status: string;
}

interface VideoMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

interface AccountInfo {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";
const TIMEOUT_SUBMIT = 30_000;
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
          `[TikTokProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[TikTokProvider] Max retries alcanzado en ${context}`
  );
}

function extractApiError(error: unknown): string {
  const axiosErr = error as AxiosError<{
    error?: { code?: string; message?: string };
  }>;
  if (axiosErr?.response?.data?.error?.message) {
    return `${axiosErr.response.data.error.code}: ${axiosErr.response.data.error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

// ---------------------------------------------------------------------------
// Funciones de publicacion
// ---------------------------------------------------------------------------

/**
 * Inicia una publicacion directa (Direct Post) en TikTok.
 * Usa el modo pull: TikTok descarga el video desde la URL proporcionada.
 */
async function initDirectPost(
  params: InitDirectPostRequest
): Promise<InitDirectPostResponse> {
  const { accessToken, videoUrl, title, privacyLevel } = params;

  logger.info(
    `[TikTokProvider] Iniciando direct post: privacy=${privacyLevel} title="${(title || "").substring(0, 40)}"`
  );

  return retryOnRateLimit(async () => {
    const body = {
      post_info: {
        title: title || "",
        privacy_level: privacyLevel,
        disable_comment: params.disableComment ?? false,
        disable_duet: params.disableDuet ?? false,
        disable_stitch: params.disableStitch ?? false,
        video_cover_timestamp_ms: params.videoCoverTimestampMs || 0
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl
      }
    };

    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      body,
      {
        headers: authHeaders(accessToken),
        timeout: TIMEOUT_SUBMIT
      }
    );

    const data = response.data.data;

    const result: InitDirectPostResponse = {
      publishId: data.publish_id,
      uploadUrl: data.upload_url,
      status: "initiated"
    };

    logger.info(
      `[TikTokProvider] Direct post iniciado: publishId=${result.publishId}`
    );

    return result;
  }, "initDirectPost");
}

/**
 * Consulta el status de una publicacion.
 */
async function getPublishStatus(
  accessToken: string,
  publishId: string
): Promise<PublishResult> {
  logger.info(
    `[TikTokProvider] Consultando status: publishId=${publishId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: authHeaders(accessToken),
        timeout: TIMEOUT_QUERY
      }
    );

    const status: string =
      response.data.data?.status || response.data.data?.publish_status || "unknown";

    logger.info(
      `[TikTokProvider] Status publishId=${publishId}: ${status}`
    );

    return { publishId, status };
  }, "getPublishStatus");
}

// ---------------------------------------------------------------------------
// Funciones de metricas
// ---------------------------------------------------------------------------

/**
 * Obtiene metricas de un video especifico.
 */
async function getVideoMetrics(
  accessToken: string,
  videoId: string
): Promise<VideoMetrics> {
  logger.info(
    `[TikTokProvider] Obteniendo metricas: videoId=${videoId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/video/query/`,
      {
        filters: {
          video_ids: [videoId]
        },
        fields: [
          "id",
          "like_count",
          "comment_count",
          "share_count",
          "view_count"
        ]
      },
      {
        headers: authHeaders(accessToken),
        timeout: TIMEOUT_QUERY
      }
    );

    const video = response.data.data?.videos?.[0];

    const result: VideoMetrics = {
      views: video?.view_count || 0,
      likes: video?.like_count || 0,
      comments: video?.comment_count || 0,
      shares: video?.share_count || 0
    };

    logger.info(
      `[TikTokProvider] Metricas videoId=${videoId}: ` +
        `views=${result.views} likes=${result.likes} shares=${result.shares}`
    );

    return result;
  }, "getVideoMetrics");
}

/**
 * Obtiene informacion de la cuenta del usuario.
 */
async function getAccountInfo(
  accessToken: string
): Promise<AccountInfo> {
  logger.info("[TikTokProvider] Obteniendo informacion de cuenta");

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${TIKTOK_API_BASE}/user/info/`,
      {
        headers: authHeaders(accessToken),
        params: {
          fields: [
            "open_id",
            "union_id",
            "display_name",
            "avatar_url",
            "follower_count",
            "following_count",
            "likes_count",
            "video_count"
          ].join(",")
        },
        timeout: TIMEOUT_QUERY
      }
    );

    const data = response.data.data?.user;

    const result: AccountInfo = {
      openId: data?.open_id || "",
      username: data?.username || "",
      displayName: data?.display_name || "",
      avatarUrl: data?.avatar_url || "",
      followerCount: data?.follower_count || 0,
      followingCount: data?.following_count || 0,
      likesCount: data?.likes_count || 0,
      videoCount: data?.video_count || 0
    };

    logger.info(
      `[TikTokProvider] Cuenta: ${result.displayName} ` +
        `followers=${result.followerCount} videos=${result.videoCount}`
    );

    return result;
  }, "getAccountInfo");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  initDirectPost,
  getPublishStatus,
  getVideoMetrics,
  getAccountInfo
};
export type {
  InitDirectPostRequest,
  InitDirectPostResponse,
  PublishResult,
  VideoMetrics,
  AccountInfo,
  PrivacyLevel
};

export default {
  initDirectPost,
  getPublishStatus,
  getVideoMetrics,
  getAccountInfo
};
