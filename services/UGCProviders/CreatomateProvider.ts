/**
 * CreatomateProvider — Composicion de video con templates de Creatomate.
 * Permite renderizar videos a partir de plantillas predefinidas,
 * reemplazando textos, imagenes, videos y colores.
 */

import axios, { AxiosError } from "axios";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface CreatomateModification {
  [elementName: string]: string | number | boolean | Record<string, unknown>;
}

interface CreatomateRenderRequest {
  templateId: string;
  modifications: CreatomateModification;
  outputFormat?: "mp4" | "gif" | "png" | "jpg";
  width?: number;
  height?: number;
  frameRate?: number;
  metadata?: Record<string, string>;
}

type CreatomateRenderStatus =
  | "planned"
  | "waiting"
  | "transcribing"
  | "rendering"
  | "succeeded"
  | "failed";

interface CreatomateRenderResponse {
  renderId: string;
  status: CreatomateRenderStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileSize?: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const CREATOMATE_API_BASE = "https://api.creatomate.com/v1";
const CREATOMATE_API_KEY = process.env.CREATOMATE_API_KEY || "";

const TIMEOUT_SUBMIT = 30_000;
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CREATOMATE_API_KEY}`,
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
          `[CreatomateProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[CreatomateProvider] Max retries alcanzado en ${context}`
  );
}

// ---------------------------------------------------------------------------
// Funciones principales
// ---------------------------------------------------------------------------

/**
 * Crea un render a partir de un template con modificaciones.
 * Retorna el renderId para consultar el progreso posteriormente.
 */
async function createRender(
  params: CreatomateRenderRequest
): Promise<CreatomateRenderResponse> {
  logger.info(
    `[CreatomateProvider] Creando render: templateId=${params.templateId} ` +
      `format=${params.outputFormat || "mp4"} modificaciones=${Object.keys(params.modifications).length}`
  );

  return retryOnRateLimit(async () => {
    const body: Record<string, unknown> = {
      template_id: params.templateId,
      modifications: params.modifications
    };

    if (params.outputFormat) body.output_format = params.outputFormat;
    if (params.width) body.width = params.width;
    if (params.height) body.height = params.height;
    if (params.frameRate) body.frame_rate = params.frameRate;
    if (params.metadata) body.metadata = params.metadata;

    const response = await axios.post(
      `${CREATOMATE_API_BASE}/renders`,
      body,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_SUBMIT
      }
    );

    // La respuesta es un array con un render
    const render = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    const renderId: string = render.id;

    logger.info(
      `[CreatomateProvider] Render creado: renderId=${renderId} status=${render.status}`
    );

    return {
      renderId,
      status: render.status || "planned"
    };
  }, "createRender");
}

/**
 * Consulta el estado de un render.
 */
async function checkRenderStatus(
  renderId: string
): Promise<CreatomateRenderResponse> {
  logger.info(
    `[CreatomateProvider] Consultando status: renderId=${renderId}`
  );

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${CREATOMATE_API_BASE}/renders/${renderId}`,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_QUERY
      }
    );

    const data = response.data;

    const result: CreatomateRenderResponse = {
      renderId,
      status: data.status,
      videoUrl: data.url,
      thumbnailUrl: data.snapshot_url,
      duration: data.duration,
      fileSize: data.file_size,
      errorMessage: data.error_message
    };

    logger.info(
      `[CreatomateProvider] Status renderId=${renderId}: ${result.status}` +
        (result.videoUrl ? ` url=${result.videoUrl}` : "") +
        (result.errorMessage ? ` error=${result.errorMessage}` : "")
    );

    return result;
  }, "checkRenderStatus");
}

/**
 * Lista los templates disponibles en la cuenta.
 */
async function listTemplates(): Promise<
  Array<{ id: string; name: string; width: number; height: number; duration: number }>
> {
  logger.info("[CreatomateProvider] Listando templates disponibles");

  return retryOnRateLimit(async () => {
    const response = await axios.get(
      `${CREATOMATE_API_BASE}/templates`,
      {
        headers: authHeaders(),
        timeout: TIMEOUT_QUERY
      }
    );

    const templates = (response.data as Array<Record<string, unknown>>).map(
      (t) => ({
        id: t.id as string,
        name: t.name as string,
        width: t.width as number,
        height: t.height as number,
        duration: t.duration as number
      })
    );

    logger.info(
      `[CreatomateProvider] ${templates.length} templates encontrados`
    );

    return templates;
  }, "listTemplates");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { createRender, checkRenderStatus, listTemplates };
export type {
  CreatomateRenderRequest,
  CreatomateRenderResponse,
  CreatomateModification,
  CreatomateRenderStatus
};

export default { createRender, checkRenderStatus, listTemplates };
