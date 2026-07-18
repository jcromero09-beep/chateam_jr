/**
 * Tipos NEUTRALES de la capa de generación de imagen/video con IA.
 *
 * Esta capa es agnóstica de proveedor: el frontend consume estos shapes sin
 * saber si detrás está Higgsfield, fal.ai u otro. Cada proveedor implementa
 * `GenerationProvider` (ver GenerationProvider.ts) y mapea su modelo de datos
 * propietario a estos tipos en su `mapper`.
 *
 * Diseñado según el spec de integración (§2 modelo normalizado, §3 request).
 */

export type MediaType = "image" | "video";

export type ProviderId = "higgsfield" | "fal";

/** Insignias visuales que el front puede renderizar en la tarjeta del modelo. */
export type ModelBadge = "NEW" | "EXCLUSIVE" | "CINEMA" | "BETA";

/** Preview (galería) de un modelo: thumbnail + ejemplo (imagen o clip). */
export interface ModelPreview {
  thumbnailUrl: string;
  exampleUrl: string;
  mediaType: MediaType;
}

/**
 * Capacidades/límites del modelo — el front las usa para construir los
 * controles (resoluciones, duraciones, aspect ratios, audio, etc.).
 */
export interface ModelCapabilities {
  resolutions: string[]; // ["720p","1080p","4K"]
  durations?: number[]; // solo video (segundos)
  aspectRatios?: string[]; // ["16:9","9:16","1:1","21:9"...]
  supportsAudio?: boolean;
  supportsStartFrame?: boolean; // start/end image
  supportsCharacters?: boolean; // soul-id "@"
  maxCount?: number; // máximo de variaciones por request (1..N)
}

/**
 * Preset/estilo seleccionable (clave del enfoque "cinema studio" de
 * Higgsfield). Cada uno trae su propio ejemplo visual y los `params` que
 * inyecta en la generación al seleccionarlo.
 */
export interface StylePreset {
  id: string; // ej. "drama"
  label: string; // ej. "Drama"
  category?: string; // ej. "Mood" | "Genre" | "Camera" | "Lighting"
  previewUrl: string; // imagen/clip de ejemplo de ESE estilo
  description?: string;
  /** Valores que este preset fusiona en el GenerationRequest. */
  params: Record<string, unknown>;
}

/** Valor de un parámetro enum, con preview opcional por opción (cámaras, ratios…). */
export interface ParamEnumValue {
  value: string;
  label: string;
  previewUrl?: string;
}

/** Especificación de un parámetro configurable del modelo. */
export interface ParamSpec {
  name: string;
  type: "string" | "number" | "enum" | "boolean" | "media";
  label: string;
  required: boolean;
  default?: unknown;
  enumValues?: ParamEnumValue[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

/** Modelo normalizado que ve el front (tarjeta de galería). */
export interface NormalizedModel {
  id: string; // = identificador del proveedor (job_set_type / modelId)
  provider: ProviderId;
  name: string;
  mediaType: MediaType;
  description?: string;
  badges?: ModelBadge[];
  previews: ModelPreview[];
  capabilities: ModelCapabilities;
  styles?: StylePreset[];
  /** Costo estimado base para mostrar antes de configurar (display). */
  pricingLabel?: string;
}

/** Detalle de modelo: agrega el schema completo de parámetros. */
export interface NormalizedModelDetail extends NormalizedModel {
  params: ParamSpec[];
}

/**
 * Payload NEUTRO de una solicitud de generación (spec §3).
 * `tenantId` se resuelve server-side desde el token (companyId); el cliente
 * NO lo envía. Se incluye aquí porque las capas internas lo necesitan.
 */
export interface GenerationRequest {
  tenantId: number; // companyId (multi-tenant)
  userId?: number; // quien dispara (auditoría)
  mediaType: MediaType;
  modelId: string;
  prompt: string;
  styleId?: string; // preset seleccionado (ej. "drama")
  resolution?: string;
  aspectRatio?: string;
  duration?: number; // video (segundos)
  audio?: boolean; // video
  references?: string[]; // upload ids (start/end image, etc.)
  characterIds?: string[]; // soul-id "@"
  count?: number; // 1..N
  /** Parámetros extra ya fusionados (defaults del modelo + estilo). */
  params?: Record<string, unknown>;
  idempotencyKey: string;
}

/** Estimación de costo devuelta por la capa neutral. */
export interface CostEstimate {
  /** Costo crudo del proveedor en USD (antes de markup). */
  providerCostUsd: number;
  /** Markup aplicado (factor multiplicativo, p.ej. 1.0 = sin markup). */
  markup: number;
  /** Créditos internos que se cobrarán a la company (ya con markup). */
  credits: number;
  /** Key de AICreditType usada (ugc_video | image | tts_character). */
  creditTypeKey: string;
  /** Etiqueta legible para el botón "Generate" dinámico. */
  displayLabel: string;
}

/** Estado normalizado de un job del proveedor. */
export type ProviderJobStatus = "queued" | "processing" | "succeeded" | "failed";

/** Output normalizado de un job. */
export interface ProviderJobOutput {
  url: string;
  mediaType: MediaType;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
}

/** Job del proveedor (estado + outputs). */
export interface ProviderJob {
  providerJobId: string;
  status: ProviderJobStatus;
  outputs?: ProviderJobOutput[];
  error?: string;
  /** Costo real reportado por el proveedor si lo expone. */
  costUsd?: number;
  raw?: unknown; // payload crudo para auditoría
}

/** Referencia de personaje reutilizable (soul-id "@"). */
export interface CharacterRef {
  id: string;
  name: string;
  previewUrl?: string;
}

/** Resultado de subir media de referencia (botón "+"). */
export interface UploadResult {
  id: string;
  url?: string;
}
