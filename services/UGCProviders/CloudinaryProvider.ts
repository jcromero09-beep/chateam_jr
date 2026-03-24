/**
 * CloudinaryProvider — Upload y transformacion de assets en Cloudinary.
 * Usa API REST directa con axios (no SDK).
 * Firma las peticiones con SHA-1 segun la especificacion de Cloudinary.
 */

import axios, { AxiosError } from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface UploadOptions {
  publicId?: string;
  tags?: string[];
  transformation?: string;
  eager?: string;
  overwrite?: boolean;
  resourceType?: "image" | "video" | "raw" | "auto";
}

interface UploadImageResult {
  url: string;
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

interface UploadVideoResult {
  url: string;
  secureUrl: string;
  publicId: string;
  duration: number;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const API_KEY = process.env.CLOUDINARY_API_KEY || "";
const API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

const UPLOAD_BASE = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;
const TIMEOUT_UPLOAD = 120_000; // 2 min para uploads grandes
const TIMEOUT_QUERY = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Genera la firma SHA-1 requerida por Cloudinary.
 */
function generateSignature(
  params: Record<string, string | number | boolean>
): string {
  // Ordenar parametros alfabeticamente y concatenar
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(signatureString + API_SECRET)
    .digest("hex");
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
          `[CloudinaryProvider] Rate limited en ${context}, reintentando en ${delay}ms (intento ${attempt}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `[CloudinaryProvider] Max retries alcanzado en ${context}`
  );
}

/**
 * Detecta si el source es una URL o un path local.
 */
function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

// ---------------------------------------------------------------------------
// Funciones principales
// ---------------------------------------------------------------------------

/**
 * Sube una imagen a Cloudinary (desde path local o URL).
 */
async function uploadImage(
  source: string,
  folder: string,
  options: UploadOptions = {}
): Promise<UploadImageResult> {
  logger.info(
    `[CloudinaryProvider] Subiendo imagen: source=${source.substring(0, 80)} folder=${folder}`
  );

  return retryOnRateLimit(async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const signParams: Record<string, string | number | boolean> = {
      folder,
      timestamp
    };

    if (options.publicId) signParams.public_id = options.publicId;
    if (options.overwrite) signParams.overwrite = true;
    if (options.tags) signParams.tags = options.tags.join(",");
    if (options.eager) signParams.eager = options.eager;

    const signature = generateSignature(signParams);

    const formData = new FormData();
    formData.append("api_key", API_KEY);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", folder);

    if (options.publicId) formData.append("public_id", options.publicId);
    if (options.overwrite) formData.append("overwrite", "true");
    if (options.tags) formData.append("tags", options.tags.join(","));
    if (options.eager) formData.append("eager", options.eager);

    if (isUrl(source)) {
      formData.append("file", source);
    } else {
      const resolvedPath = path.resolve(source);
      formData.append("file", fs.createReadStream(resolvedPath));
    }

    const response = await axios.post(
      `${UPLOAD_BASE}/image/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: TIMEOUT_UPLOAD,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const data = response.data;

    const result: UploadImageResult = {
      url: data.url,
      secureUrl: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes
    };

    logger.info(
      `[CloudinaryProvider] Imagen subida: publicId=${result.publicId} ` +
        `${result.width}x${result.height} ${result.format}`
    );

    return result;
  }, "uploadImage");
}

/**
 * Sube un video a Cloudinary (desde path local o URL).
 */
async function uploadVideo(
  source: string,
  folder: string,
  options: UploadOptions = {}
): Promise<UploadVideoResult> {
  logger.info(
    `[CloudinaryProvider] Subiendo video: source=${source.substring(0, 80)} folder=${folder}`
  );

  return retryOnRateLimit(async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const signParams: Record<string, string | number | boolean> = {
      folder,
      timestamp,
      resource_type: "video"
    };

    if (options.publicId) signParams.public_id = options.publicId;
    if (options.overwrite) signParams.overwrite = true;
    if (options.tags) signParams.tags = options.tags.join(",");

    const signature = generateSignature(signParams);

    const formData = new FormData();
    formData.append("api_key", API_KEY);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", folder);

    if (options.publicId) formData.append("public_id", options.publicId);
    if (options.overwrite) formData.append("overwrite", "true");
    if (options.tags) formData.append("tags", options.tags.join(","));

    if (isUrl(source)) {
      formData.append("file", source);
    } else {
      const resolvedPath = path.resolve(source);
      formData.append("file", fs.createReadStream(resolvedPath));
    }

    const response = await axios.post(
      `${UPLOAD_BASE}/video/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: TIMEOUT_UPLOAD,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const data = response.data;

    const result: UploadVideoResult = {
      url: data.url,
      secureUrl: data.secure_url,
      publicId: data.public_id,
      duration: data.duration,
      format: data.format,
      width: data.width,
      height: data.height,
      bytes: data.bytes
    };

    logger.info(
      `[CloudinaryProvider] Video subido: publicId=${result.publicId} ` +
        `${result.duration}s ${result.format}`
    );

    return result;
  }, "uploadVideo");
}

/**
 * Elimina un asset de Cloudinary por su publicId.
 */
async function deleteAsset(
  publicId: string,
  resourceType: "image" | "video" = "image"
): Promise<boolean> {
  logger.info(
    `[CloudinaryProvider] Eliminando asset: publicId=${publicId} type=${resourceType}`
  );

  return retryOnRateLimit(async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const signParams: Record<string, string | number | boolean> = {
      public_id: publicId,
      timestamp
    };

    const signature = generateSignature(signParams);

    const response = await axios.post(
      `${UPLOAD_BASE}/${resourceType}/destroy`,
      {
        public_id: publicId,
        api_key: API_KEY,
        timestamp,
        signature
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: TIMEOUT_QUERY
      }
    );

    const success = response.data.result === "ok";

    logger.info(
      `[CloudinaryProvider] Asset ${success ? "eliminado" : "no encontrado"}: publicId=${publicId}`
    );

    return success;
  }, "deleteAsset");
}

/**
 * Genera una URL con transformaciones de Cloudinary.
 */
function getTransformUrl(
  publicId: string,
  transformations: string,
  resourceType: "image" | "video" = "image"
): string {
  const url = `https://res.cloudinary.com/${CLOUD_NAME}/${resourceType}/upload/${transformations}/${publicId}`;

  logger.info(
    `[CloudinaryProvider] Transform URL: publicId=${publicId} transform=${transformations}`
  );

  return url;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { uploadImage, uploadVideo, deleteAsset, getTransformUrl };
export type { UploadOptions, UploadImageResult, UploadVideoResult };

export default { uploadImage, uploadVideo, deleteAsset, getTransformUrl };
