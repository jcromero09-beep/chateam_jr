/**
 * Tipos compartidos del adapter pattern para modelos fal.ai.
 *
 * Cada adapter se especializa en un model_id concreto de fal.ai y se
 * encarga de:
 *   1. Validar los defaults configurables que el usuario guarda en la
 *      campaña (defaultSchema).
 *   2. Validar los inputs completos justo antes de submit, sumando los
 *      assets de runtime (prompt, image_url, video_url, etc.) — runtimeSchema.
 *   3. Mapear los inputs a la forma snake_case que fal.ai espera.
 *   4. Normalizar el output a un shape estable interno.
 *   5. Estimar el costo en USD.
 *
 * PR #2: agrega `category`, `inputs[]`, `outputs[]`, `available?` para
 * soportar el pipeline-builder multi-slot. `type` (PR #1) se mantiene
 * para retrocompat — `category` es la nueva fuente de verdad.
 *
 * El job de Bull jamás llama a fal.ai directamente: siempre pasa por un
 * adapter del registry. Si no hay adapter para una key, se lanza error
 * explícito (no defaults silenciosos).
 */

import type { z, ZodTypeAny } from "zod";

/**
 * Categoría estricta del adapter (PR #2 — fuente de verdad).
 * `type` se conserva como alias informal para retrocompat con PR #1.
 */
export type FalAdapterCategory =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "video-to-video" // motion-control
  | "text-to-speech"
  | "lipsync";

/** Alias retrocompat del PR #1. Mapea 1:1 a algunas categorías nuevas. */
export type FalAdapterType =
  | "image-to-video"
  | "motion-control"
  | "image-edit"
  | "text-to-image"
  | "text-to-video"
  | "text-to-speech"
  | "lipsync";

/** Tipos de I/O usados para la línea visual "X + Y → Z" en la UI. */
export type FalIOType = "text" | "image" | "video" | "audio";

export type FalCampaignAssetRequirement =
  | "characterImage"
  | "motionReferenceVideo"
  | "endImage"
  | "audioReference";

/**
 * Contrato que todos los adapters deben cumplir.
 *
 * @template TDefault  Tipo inferido de defaultSchema (lo que se persiste en campaña)
 * @template TRuntime  Tipo inferido de runtimeSchema  (defaults + assets reales)
 * @template TOutput   Shape normalizado del resultado de fal.ai
 */
export interface FalAdapter<
  TDefault = unknown,
  TRuntime = unknown,
  TOutput = unknown
> {
  /** Clave estable para el registry y para UGCCampaign.{video,image,voice,lipsync}ModelKey */
  readonly key: string;

  /** Model ID literal de fal.ai (puede ser sobrescrito por env override) */
  readonly modelId: string;

  /** Tipo de tarea — alias retrocompat del PR #1. Prefiere `category`. */
  readonly type: FalAdapterType;

  /** Categoría estricta (PR #2). Fuente de verdad para filtrar en el wizard. */
  readonly category: FalAdapterCategory;

  /**
   * Qué entradas necesita el modelo. Se renderiza en la UI como
   * "Texto + Imagen → Video".
   */
  readonly inputs: ReadonlyArray<FalIOType>;

  /** Qué salidas produce. */
  readonly outputs: ReadonlyArray<FalIOType>;

  /**
   * Si el adapter está disponible para selección. Algunos modelos
   * partner de fal.ai requieren whitelist por cuenta — esos pueden
   * marcarse como `available: false` para ocultarlos del catálogo
   * público sin borrarlos del registry. Default `true`.
   */
  readonly available?: boolean;

  /**
   * Schema Zod para validar el JSONB que se persiste en
   * UGCCampaign.{video,image,voice,lipsync}ModelDefaults.
   *
   * NO incluye assets de runtime — solo los "ajustes" configurables.
   */
  readonly defaultSchema: ZodTypeAny;

  /**
   * Schema Zod completo que se valida justo antes de fal.queue.submit,
   * incluyendo defaults + assets de runtime resueltos por el pipeline.
   */
  readonly runtimeSchema: ZodTypeAny;

  /**
   * Mapea los inputs validados (runtime) a la forma snake_case que fal.ai
   * espera. Implementaciones DEBEN filtrar undefined antes de retornar.
   */
  mapInput(params: TRuntime): Record<string, unknown>;

  /**
   * Normaliza el output crudo de fal.ai a un shape estable interno
   * del que el job puede depender sin sorpresas.
   */
  mapOutput(raw: unknown): TOutput;

  /**
   * Estima el costo en USD para los parámetros runtime dados.
   * Para TTS, recibe el texto en `params.text` y calcula por carácter.
   */
  estimateCostUsd(params: TRuntime): number;

  /**
   * Hint declarativo para la UI/validador: qué assets de la campaña
   * deben estar presentes antes de que la selección sea ejecutable.
   */
  readonly requiresCampaignAssets?: ReadonlyArray<FalCampaignAssetRequirement>;
}

/** Utilidad para inferir TDefault a partir del adapter */
export type AdapterDefault<A> = A extends FalAdapter<infer D, unknown, unknown>
  ? D
  : never;

/** Utilidad para inferir TRuntime a partir del adapter */
export type AdapterRuntime<A> = A extends FalAdapter<unknown, infer R, unknown>
  ? R
  : never;

/** Utilidad para inferir TOutput a partir del adapter */
export type AdapterOutput<A> = A extends FalAdapter<unknown, unknown, infer O>
  ? O
  : never;

/** Re-export del tipo de Zod más usado. */
export type ZodOf<T extends ZodTypeAny> = z.infer<T>;
