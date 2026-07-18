/**
 * YouTubeProvider — Upload de videos y metricas via YouTube Data API v3.
 * Soporta videos normales, Shorts, metricas y comentarios.
 *
 * NOTA: Quota limit de YouTube es 10,000 units/dia.
 * Cada upload consume ~1,600 units. Cada query ~1-5 units.
 */

import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

type PrivacyStatus = "public" | "unlisted" | "private";
type VideoCategory =
  | "1"   // Film & Animation
  | "2"   // Autos & Vehicles
  | "10"  // Music
  | "15"  // Pets & Animals
  | "17"  // Sports
  | "20"  // Gaming
  | "22"  // People & Blogs
  | "24"  // Entertainment
  | "25"  // News & Politics
  | "26"  // Howto & Style
  | "27"  // Education
  | "28"  // Science & Technology
  | "29"; // Nonprofits & Activism

interface UploadVideoRequest {
  accessToken: string;
  videoPath: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: PrivacyStatus;
  categoryId?: VideoCategory;
  madeForKids?: boolean;
  defaultLanguage?: string;
}

interface UploadResult {
  videoId: string;
  title: string;
  publishedAt: string;
  channelId: string;
  thumbnailUrl?: string;
}

interface VideoMetrics {
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  favorites: number;
  estimatedMinutesWatched?: number;
}

interface ChannelMetrics {
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  hiddenSubscriberCount: boolean;
}

interface CommentData {
  id: string;
  authorName: string;
  authorChannelId: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

const TIMEOUT_UPLOAD = 300_000; // 5 min para uploads
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// Costos de quota (referencia)
const QUOTA_COSTS = {
  upload: 1600,
  list: 1,
  insert: 50,
  update: 50,
  delete: 50
} as const;

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
      const status = axiosErr?.response?.status;

      // YouTube usa 403 para quota exceeded y 429 para rate limit
      if ((status === 429 || status === 403) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn(
          `[YouTubeProvider] Rate limited/quota en ${context} (HTTP ${status}), ` +
            `reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[YouTubeProvider] Max retries alcanzado en ${context}`
  );
}

function extractApiError(error: unknown): string {
  const axiosErr = error as AxiosError<{
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  }>;
  if (axiosErr?.response?.data?.error?.message) {
    const reason =
      axiosErr.response.data.error.errors?.[0]?.reason || "";
    return `${axiosErr.response.data.error.message}${reason ? ` (${reason})` : ""}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

// ---------------------------------------------------------------------------
// Funciones de upload
// ---------------------------------------------------------------------------

/**
 * Sube un video a YouTube usando resumable upload.
 * Consume ~1,600 units de quota.
 */
async function uploadVideo(
  params: UploadVideoRequest
): Promise<UploadResult> {
  const {
    accessToken,
    videoPath,
    title,
    description,
    tags,
    privacyStatus,
    categoryId,
    madeForKids,
    defaultLanguage
  } = params;

  const resolvedPath = path.resolve(videoPath);

  logger.info(
    `[YouTubeProvider] Subiendo video: title="${title}" path=${resolvedPath} ` +
      `privacy=${privacyStatus || "private"} (quota cost: ~${QUOTA_COSTS.upload} units)`
  );

  try {
    // Paso 1: Iniciar resumable upload
    const metadata = {
      snippet: {
        title,
        description: description || "",
        tags: tags || [],
        categoryId: categoryId || "22", // People & Blogs por defecto
        defaultLanguage: defaultLanguage || "es"
      },
      status: {
        privacyStatus: privacyStatus || "private",
        selfDeclaredMadeForKids: madeForKids ?? false
      }
    };

    const initResponse = await retryOnRateLimit(
      () =>
        axios.post(
          `${YT_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
          metadata,
          {
            headers: {
              ...authHeaders(accessToken),
              "Content-Type": "application/json",
              "X-Upload-Content-Type": "video/*"
            },
            timeout: TIMEOUT_QUERY
          }
        ),
      "initUpload"
    );

    const uploadUrl = initResponse.headers.location;

    if (!uploadUrl) {
      throw new Error(
        "[YouTubeProvider] No se recibio URL de upload resumable"
      );
    }

    logger.info(
      `[YouTubeProvider] Upload URL obtenida, subiendo archivo...`
    );

    // Paso 2: Subir el archivo
    const fileStream = fs.createReadStream(resolvedPath);
    const fileStats = fs.statSync(resolvedPath);

    const uploadResponse = await axios.put(uploadUrl, fileStream, {
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "video/*",
        "Content-Length": String(fileStats.size)
      },
      timeout: TIMEOUT_UPLOAD,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const data = uploadResponse.data;

    const result: UploadResult = {
      videoId: data.id,
      title: data.snippet?.title || title,
      publishedAt: data.snippet?.publishedAt || new Date().toISOString(),
      channelId: data.snippet?.channelId || "",
      thumbnailUrl:
        data.snippet?.thumbnails?.default?.url ||
        data.snippet?.thumbnails?.medium?.url
    };

    logger.info(
      `[YouTubeProvider] Video subido: videoId=${result.videoId} channel=${result.channelId}`
    );

    return result;
  } catch (error: unknown) {
    const message = extractApiError(error);
    logger.error(
      `[YouTubeProvider] Error subiendo video: ${message}`
    );
    throw new Error(`YouTube upload error: ${message}`);
  }
}

/**
 * Sube un Short a YouTube (video vertical, <= 60 segundos).
 * Agrega #Shorts al titulo automaticamente si no lo incluye.
 */
async function uploadShort(
  accessToken: string,
  videoPath: string,
  title: string,
  description?: string,
  tags?: string[]
): Promise<UploadResult> {
  const shortTitle = title.includes("#Shorts")
    ? title
    : `${title} #Shorts`;

  logger.info(
    `[YouTubeProvider] Subiendo Short: title="${shortTitle}"`
  );

  return uploadVideo({
    accessToken,
    videoPath,
    title: shortTitle,
    description,
    tags: [...(tags || []), "Shorts"],
    privacyStatus: "public",
    categoryId: "22"
  });
}

// ---------------------------------------------------------------------------
// Funciones de metricas
// ---------------------------------------------------------------------------

/**
 * Obtiene metricas de un video especifico.
 * Costo: ~1 unit de quota.
 */
async function getVideoMetrics(
  accessToken: string,
  videoId: string
): Promise<VideoMetrics> {
  logger.info(
    `[YouTubeProvider] Obteniendo metricas: videoId=${videoId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(`${YT_API_BASE}/videos`, {
      params: {
        part: "statistics",
        id: videoId
      },
      headers: authHeaders(accessToken),
      timeout: TIMEOUT_QUERY
    });

    const stats = response.data.items?.[0]?.statistics;

    if (!stats) {
      throw new Error(
        `[YouTubeProvider] Video no encontrado: ${videoId}`
      );
    }

    const result: VideoMetrics = {
      views: parseInt(stats.viewCount || "0", 10),
      likes: parseInt(stats.likeCount || "0", 10),
      dislikes: parseInt(stats.dislikeCount || "0", 10),
      comments: parseInt(stats.commentCount || "0", 10),
      favorites: parseInt(stats.favoriteCount || "0", 10)
    };

    logger.info(
      `[YouTubeProvider] Metricas videoId=${videoId}: ` +
        `views=${result.views} likes=${result.likes} comments=${result.comments}`
    );

    return result;
  }, "getVideoMetrics");
}

/**
 * Obtiene metricas del canal.
 * Costo: ~1 unit de quota.
 */
async function getChannelMetrics(
  accessToken: string,
  channelId: string
): Promise<ChannelMetrics> {
  logger.info(
    `[YouTubeProvider] Obteniendo metricas de canal: channelId=${channelId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(`${YT_API_BASE}/channels`, {
      params: {
        part: "statistics",
        id: channelId
      },
      headers: authHeaders(accessToken),
      timeout: TIMEOUT_QUERY
    });

    const stats = response.data.items?.[0]?.statistics;

    if (!stats) {
      throw new Error(
        `[YouTubeProvider] Canal no encontrado: ${channelId}`
      );
    }

    const result: ChannelMetrics = {
      subscriberCount: parseInt(stats.subscriberCount || "0", 10),
      videoCount: parseInt(stats.videoCount || "0", 10),
      viewCount: parseInt(stats.viewCount || "0", 10),
      hiddenSubscriberCount: stats.hiddenSubscriberCount || false
    };

    logger.info(
      `[YouTubeProvider] Canal channelId=${channelId}: ` +
        `subs=${result.subscriberCount} videos=${result.videoCount} views=${result.viewCount}`
    );

    return result;
  }, "getChannelMetrics");
}

/**
 * Obtiene comentarios de un video.
 * Costo: ~1 unit de quota.
 */
async function getComments(
  accessToken: string,
  videoId: string,
  maxResults = 50
): Promise<CommentData[]> {
  logger.info(
    `[YouTubeProvider] Obteniendo comentarios: videoId=${videoId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${YT_API_BASE}/commentThreads`,
      {
        params: {
          part: "snippet",
          videoId,
          maxResults,
          order: "relevance",
          textFormat: "plainText"
        },
        headers: authHeaders(accessToken),
        timeout: TIMEOUT_QUERY
      }
    );

    const comments: CommentData[] = (
      response.data.items as Array<Record<string, unknown>>
    ).map((item) => {
      const snippet = (
        item.snippet as Record<string, unknown>
      ).topLevelComment as Record<string, unknown>;
      const commentSnippet = snippet.snippet as Record<string, unknown>;

      return {
        id: snippet.id as string,
        authorName: commentSnippet.authorDisplayName as string,
        authorChannelId:
          (
            commentSnippet.authorChannelId as Record<string, string>
          )?.value || "",
        text: commentSnippet.textDisplay as string,
        likeCount: (commentSnippet.likeCount as number) || 0,
        publishedAt: commentSnippet.publishedAt as string,
        updatedAt: commentSnippet.updatedAt as string
      };
    });

    logger.info(
      `[YouTubeProvider] ${comments.length} comentarios encontrados para videoId=${videoId}`
    );

    return comments;
  }, "getComments");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  uploadVideo,
  uploadShort,
  getVideoMetrics,
  getChannelMetrics,
  getComments,
  QUOTA_COSTS
};
export type {
  UploadVideoRequest,
  UploadResult,
  VideoMetrics,
  ChannelMetrics,
  CommentData,
  PrivacyStatus,
  VideoCategory
};

export default {
  uploadVideo,
  uploadShort,
  getVideoMetrics,
  getChannelMetrics,
  getComments,
  QUOTA_COSTS
};
