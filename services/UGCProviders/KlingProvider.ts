/**
 * KlingProvider — Generacion de video con Kling AI
 * Soporta text-to-video e image-to-video.
 * Modelo asincrono: se envia la tarea y se consulta el status por polling.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface KlingVideoRequest {
  prompt: string;
  negativePrompt?: string;
  duration: 5 | 10;
  aspectRatio: "16:9" | "9:16" | "1:1";
  mode: "standard" | "professional";
  imageUrl?: string;
  callbackUrl?: string;
}

interface KlingVideoResponse {
  taskId: string;
  status: "submitted" | "processing" | "completed" | "failed";
  videoUrl?: string;
  duration?: number;
  creditsUsed?: number;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const KLING_API_BASE =
  process.env.KLING_API_BASE || "https://api.klingai.com/v1";
const KLING_API_KEY = process.env.KLING_API_KEY || "";

const TIMEOUT_SUBMIT = 30_000;
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${KLING_API_KEY}`,
    "Content-Type": "application/json"
  };
}

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
          `[KlingProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[KlingProvider] Max retries alcanzado en ${context}`);
}

// ---------------------------------------------------------------------------
// Funciones principales
// ---------------------------------------------------------------------------

/**
 * Envia una solicitud de generacion de video a Kling AI.
 * Retorna el taskId para consultar el progreso posteriormente.
 */
async function generateVideo(
  params: KlingVideoRequest
): Promise<KlingVideoResponse> {
  const endpoint = params.imageUrl
    ? "/videos/image2video"
    : "/videos/text2video";

  logger.info(
    `[KlingProvider] Generando video (${endpoint}): prompt="${params.prompt.substring(0, 50)}..." ` +
      `duration=${params.duration}s aspect=${params.aspectRatio} mode=${params.mode}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.post(
      `${KLING_API_BASE}${endpoint}`,
      {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        duration: params.duration || 5,
        aspect_ratio: params.aspectRatio || "9:16",
        mode: params.mode || "standard",
        image_url: params.imageUrl,
        callback_url: params.callbackUrl
      },
      {
        headers: authHeaders(),
        timeout: TIMEOUT_SUBMIT
      }
    );

    const taskId: string = response.data.task_id || response.data.id;

    logger.info(
      `[KlingProvider] Tarea creada: taskId=${taskId}`
    );

    return {
      taskId,
      status: "submitted",
      creditsUsed: response.data.credits_used
    };
  }, "generateVideo");
}

/**
 * Consulta el estado de una tarea de generacion de video.
 */
async function checkVideoStatus(
  taskId: string
): Promise<KlingVideoResponse> {
  logger.info(`[KlingProvider] Consultando status: taskId=${taskId}`);

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${KLING_API_BASE}/videos/${taskId}`,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_QUERY
      }
    );

    const result: KlingVideoResponse = {
      taskId,
      status: response.data.status,
      videoUrl: response.data.video_url,
      duration: response.data.duration
    };

    logger.info(
      `[KlingProvider] Status taskId=${taskId}: ${result.status}` +
        (result.videoUrl ? ` videoUrl=${result.videoUrl}` : "")
    );

    return result;
  }, "checkVideoStatus");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { generateVideo, checkVideoStatus };
export type { KlingVideoRequest, KlingVideoResponse };

export default { generateVideo, checkVideoStatus };
