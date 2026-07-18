/**
 * Tipos CRUDOS del proveedor Higgsfield — alineados al SDK oficial
 * @higgsfield/client v0.2.1 (verificado, NO asumido).
 *
 * Endpoints de generación (job_set_type):
 *   POST /v1/text2image/soul      → SoulText2ImageInput   (imagen)
 *   POST /v1/image2video/dop      → DoPImage2VideoInput    (video, cinema)
 *   POST /v1/speak/higgsfield     → SpeakVideoInput        (talking head)
 * Body: { params: <input>, webhook?: { url, secret } }
 * Respuesta: JobSet  → poll GET /v1/job-sets/{id}
 */

/** Estados de un job (enum real del SDK). */
export type HiggsfieldJobStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

/** Un resultado dentro de un job (raw = full, min = thumbnail). */
export interface HiggsfieldJobResult {
  url: string;
  type?: "image" | "video";
}

export interface HiggsfieldJob {
  id: string;
  status: HiggsfieldJobStatus | string;
  results?: {
    raw?: HiggsfieldJobResult;
    min?: HiggsfieldJobResult;
  } | null;
}

/** Respuesta de POST /v1/<endpoint> y de GET /v1/job-sets/{id}. */
export interface HiggsfieldJobSet {
  id: string;
  jobs: HiggsfieldJob[];
}

/** Soul style — GET /v1/text2image/soul-styles. */
export interface HiggsfieldSoulStyle {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
}

/** Motion (movimiento de cámara cinematográfico) — GET /v1/motions. */
export interface HiggsfieldMotion {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
}

/** Custom reference / soul-id — GET /v1/custom-references/list. */
export interface HiggsfieldCustomReference {
  id: string;
  name?: string;
  status?: string;
  preview_url?: string;
}

export interface HiggsfieldCustomReferenceList {
  items: HiggsfieldCustomReference[];
  page?: number;
  page_size?: number;
  total?: number;
}

/** POST /files/generate-upload-url. */
export interface HiggsfieldUploadLink {
  upload_url: string;
  public_url: string;
}

/** Referencia de imagen/audio en los inputs. */
export interface HiggsfieldImageRef {
  type: "image_url";
  image_url: string;
}
export interface HiggsfieldAudioRef {
  type: "audio_url";
  audio_url: string;
}

/** Input de /v1/text2image/soul. */
export interface SoulText2ImageInput {
  prompt: string;
  width_and_height: string; // p.ej. "1080x1920"
  quality: "720p" | "1080p";
  batch_size: 1 | 4;
  style_id?: string;
  style_strength?: number;
  custom_reference_id?: string;
  custom_reference_strength?: number;
  image_reference?: HiggsfieldImageRef;
  enhance_prompt?: boolean;
  seed?: number;
}

/** Input de /v1/image2video/dop (Director of Photography — cinema). */
export interface DoPImage2VideoInput {
  model: "dop-lite" | "dop-turbo" | "dop-standard";
  prompt: string;
  input_images: HiggsfieldImageRef[];
  motions?: Array<{ id: string; strength: number }>;
  seed?: number;
  enhance_prompt?: boolean;
}

/** Input de /v1/speak/higgsfield (talking head). */
export interface SpeakVideoInput {
  input_image: HiggsfieldImageRef;
  input_audio: HiggsfieldAudioRef;
  prompt: string;
  quality: "mid" | "high";
  duration: 5 | 10 | 15;
  seed?: number;
}

/** Endpoints conocidos (job_set_type). */
export const HF_ENDPOINTS = {
  soulText2Image: "/v1/text2image/soul",
  dopImage2Video: "/v1/image2video/dop",
  speak: "/v1/speak/higgsfield"
} as const;

export type HiggsfieldEndpoint =
  (typeof HF_ENDPOINTS)[keyof typeof HF_ENDPOINTS];

/** Payload de webhook de Higgsfield (job-set; flexible). */
export interface HiggsfieldWebhookPayload {
  id?: string;
  jobs?: HiggsfieldJob[];
  // v2 fallback
  request_id?: string;
  status?: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
}
