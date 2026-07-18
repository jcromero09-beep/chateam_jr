/**
 * RunwayProvider — Generacion de video con Runway ML (Gen-3 Alpha Turbo)
 * Modelo asincrono: se envia la tarea y se consulta el status por polling.
 * Soporta image-to-video con prompt de texto opcional.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface RunwayVideoRequest {
  promptText?: string;
  promptImage?: string; // URL publica o base64
  duration: 5 | 10;
  watermark?: boolean;
  seed?: number;
  model?: "gen3a_turbo" | "gen3a";
}

type RunwayTaskStatus =
  | "PENDING"
  | "THROTTLED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

interface RunwayVideoResponse {
  taskId: string;
  status: RunwayTaskStatus;
  videoUrl?: string;
  duration?: number;
  createdAt?: string;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const RUNWAY_API_BASE =
  process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com/v1";
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || "";

const TIMEOUT_SUBMIT = 30_000;
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${RUNWAY_API_KEY}`,
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06"
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
          `[RunwayProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[RunwayProvider] Max retries alcanzado en ${context}`);
}

// ---------------------------------------------------------------------------
// Funciones principales
// ---------------------------------------------------------------------------

/**
 * Inicia la generacion de un video con Runway Gen-3 Alpha.
 * Requiere al menos promptImage o promptText.
 */
async function generateVideo(
  params: RunwayVideoRequest
): Promise<RunwayVideoResponse> {
  if (!params.promptImage && !params.promptText) {
    throw new Error(
      "[RunwayProvider] Se requiere al menos promptImage o promptText"
    );
  }

  const model = params.model || "gen3a_turbo";

  logger.info(
    `[RunwayProvider] Generando video: model=${model} duration=${params.duration}s ` +
      `hasImage=${!!params.promptImage} hasText=${!!params.promptText}`
  );

  return retryOnRateLimit(async () => {
    const body: Record<string, unknown> = {
      model,
      duration: params.duration || 5,
      watermark: params.watermark ?? false
    };

    if (params.promptImage) {
      body.promptImage = params.promptImage;
    }
    if (params.promptText) {
      body.promptText = params.promptText;
    }
    if (params.seed !== undefined) {
      body.seed = params.seed;
    }

    const response = await axios.post(
      `${RUNWAY_API_BASE}/image_to_video`,
      body,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_SUBMIT
      }
    );

    const taskId: string = response.data.id;

    logger.info(`[RunwayProvider] Tarea creada: taskId=${taskId}`);

    return {
      taskId,
      status: "PENDING",
      createdAt: response.data.createdAt
    };
  }, "generateVideo");
}

/**
 * Consulta el estado de una tarea de generacion en Runway.
 */
async function checkVideoStatus(
  taskId: string
): Promise<RunwayVideoResponse> {
  logger.info(`[RunwayProvider] Consultando status: taskId=${taskId}`);

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${RUNWAY_API_BASE}/tasks/${taskId}`,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_QUERY
      }
    );

    const data = response.data;

    const result: RunwayVideoResponse = {
      taskId,
      status: data.status,
      videoUrl: data.output?.[0] || data.videoUrl,
      duration: data.duration,
      createdAt: data.createdAt,
      failureReason: data.failure || data.failureReason
    };

    logger.info(
      `[RunwayProvider] Status taskId=${taskId}: ${result.status}` +
        (result.videoUrl ? ` videoUrl=${result.videoUrl}` : "") +
        (result.failureReason ? ` reason=${result.failureReason}` : "")
    );

    return result;
  }, "checkVideoStatus");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { generateVideo, checkVideoStatus };
export type { RunwayVideoRequest, RunwayVideoResponse, RunwayTaskStatus };

export default { generateVideo, checkVideoStatus };
