/**
 * Registro de modelos REALES de Higgsfield, descubiertos sondeando la API
 * (no hay endpoint de listado). Cada entrada es un endpoint /v1/{familia}/{modelo}
 * con sus enums reales extraídos de los errores de validación de pydantic.
 *
 * Fuente de verdad para:
 *   • catalog.ts  → genera NormalizedModelDetail (UI)
 *   • mapper.ts   → buildModelParams construye el `params` exacto por modelo
 *
 * Verificado 2026-06-24 contra platform.higgsfield.ai.
 */

import type { ModelBadge, MediaType } from "../../Generation/types";

export type HFFamily = "image2video" | "text2image" | "speak";

export interface HFEnum {
  value: string;
  label: string;
}

export interface HFModelDef {
  endpoint: string; // = id del modelo (job_set_type)
  name: string;
  mediaType: MediaType;
  family: HFFamily;
  badges?: ModelBadge[];
  description?: string;
  pricingLabel?: string;
  /** Campo de imagen requerido: input_image (singular) | input_images (plural) | none. */
  imageField?: "input_image" | "input_images" | null;
  /** Si la imagen de inicio es OBLIGATORIA. */
  requiresImage?: boolean;
  /** Variantes del modelo (param `model`). */
  modelVariants?: HFEnum[];
  /** Resoluciones (valor RAW que espera la API). */
  resolutions?: HFEnum[];
  /** Para soul: campo `quality` (720p/1080p) en vez de resolution. */
  qualities?: HFEnum[];
  /** Duraciones (segundos). */
  durations?: number[];
  /** Aspect ratios (valor RAW de la API). */
  aspectRatios?: string[];
  /** Solo soul: lista de width_and_height permitidos + mapeo desde aspect. */
  widthHeights?: string[];
  /** Solo soul: batch_size. */
  batchSizes?: number[];
  /** Origen de estilos dinámicos: soul-styles | motions | none. */
  stylesSource?: "soul-styles" | "motions" | null;
  /** Speak: requiere audio. */
  requiresAudio?: boolean;
}

const res = (...vals: string[]): HFEnum[] =>
  vals.map(v => ({ value: v, label: /^\d+$/.test(v) ? `${v}p` : v }));

export const HF_MODELS: HFModelDef[] = [
  // ===================== VIDEO (image2video) =====================
  {
    endpoint: "/v1/image2video/dop",
    name: "Higgsfield DoP — Cinema",
    mediaType: "video",
    family: "image2video",
    badges: ["CINEMA", "EXCLUSIVE"],
    description:
      "Director of Photography: anima una imagen con movimientos de cámara cinematográficos (motions).",
    pricingLabel: "video · DoP",
    imageField: "input_images",
    requiresImage: true,
    modelVariants: [
      { value: "dop-standard", label: "Standard" },
      { value: "dop-turbo", label: "Turbo" },
      { value: "dop-lite", label: "Lite" }
    ],
    stylesSource: "motions"
  },
  {
    endpoint: "/v1/image2video/kling",
    name: "Kling",
    mediaType: "video",
    family: "image2video",
    badges: ["NEW"],
    description: "Kling 2.1 — animación realista de alta calidad desde imagen.",
    pricingLabel: "video · Kling",
    imageField: "input_image",
    requiresImage: true,
    modelVariants: [
      { value: "kling-v2-1", label: "Kling 2.1" },
      { value: "kling-v2-1-master", label: "Kling 2.1 Master" }
    ],
    durations: [5, 10]
  },
  {
    endpoint: "/v1/image2video/seedance",
    name: "Seedance",
    mediaType: "video",
    family: "image2video",
    description: "ByteDance Seedance — cinematográfico con física realista.",
    pricingLabel: "video · Seedance",
    imageField: "input_image",
    requiresImage: true,
    modelVariants: [
      { value: "seedance_pro", label: "Pro" },
      { value: "seedance_lite", label: "Lite" }
    ],
    resolutions: res("480", "720", "1080"),
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    aspectRatios: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]
  },
  {
    endpoint: "/v1/image2video/minimax",
    name: "Minimax Hailuo",
    mediaType: "video",
    family: "image2video",
    description: "Minimax Hailuo — movimiento fluido y expresivo.",
    pricingLabel: "video · Minimax",
    imageField: "input_image",
    requiresImage: true,
    resolutions: res("512", "768", "1080"),
    durations: [6, 10]
  },
  {
    endpoint: "/v1/image2video/veo3",
    name: "Google Veo 3",
    mediaType: "video",
    family: "image2video",
    badges: ["NEW"],
    description: "Google Veo 3 — calidad cinematográfica con audio nativo.",
    pricingLabel: "video · Veo 3",
    imageField: "input_image",
    requiresImage: true,
    modelVariants: [
      { value: "veo-3-preview", label: "Preview" },
      { value: "veo-3-fast", label: "Fast" }
    ],
    resolutions: res("720", "1080"),
    aspectRatios: ["16:9", "9:16"]
  },
  // ===================== IMAGEN (text2image) =====================
  {
    endpoint: "/v1/text2image/soul",
    name: "Higgsfield Soul",
    mediaType: "image",
    family: "text2image",
    badges: ["NEW", "CINEMA"],
    description:
      "Imágenes fotorrealistas con estilos seleccionables (soul-styles) e identidad de personaje.",
    pricingLabel: "imagen · Soul",
    imageField: "image_reference" as never, // referencia opcional (no obligatoria)
    requiresImage: false,
    qualities: [
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" }
    ],
    aspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3"],
    widthHeights: [
      "1152x2048", "2048x1152", "2048x1536", "1536x2048", "1344x2016",
      "2016x1344", "960x1696", "1536x1536", "1536x1152", "1696x960",
      "1152x1536", "1088x1632", "1632x1088", "1120x1680", "1680x1120", "2048x2048"
    ],
    batchSizes: [1, 4],
    stylesSource: "soul-styles"
  },
  {
    endpoint: "/v1/text2image/seedream",
    name: "Seedream",
    mediaType: "image",
    family: "text2image",
    description: "Seedream — edición/generación de imagen con referencia.",
    pricingLabel: "imagen · Seedream",
    imageField: "input_images",
    requiresImage: true,
    qualities: [
      { value: "basic", label: "Basic" },
      { value: "high", label: "High" }
    ],
    aspectRatios: ["1:1", "4:3", "16:9", "3:2", "21:9", "3:4", "9:16", "2:3"]
  },
  {
    endpoint: "/v1/text2image/nano-banana",
    name: "Nano Banana",
    mediaType: "image",
    family: "text2image",
    badges: ["NEW"],
    description: "Nano Banana — edición de imagen guiada por prompt.",
    pricingLabel: "imagen · Nano Banana",
    imageField: "input_images",
    requiresImage: true,
    aspectRatios: ["1:1", "4:3", "16:9", "3:4", "9:16"]
  },
  // ===================== SPEAK (talking head) =====================
  {
    endpoint: "/v1/speak/higgsfield",
    name: "Higgsfield Speak",
    mediaType: "video",
    family: "speak",
    badges: ["BETA"],
    description: "Talking head: imagen del rostro + audio → avatar con lipsync.",
    pricingLabel: "video · Speak",
    imageField: "input_image",
    requiresImage: true,
    requiresAudio: true,
    durations: [5, 10, 15],
    qualities: [
      { value: "high", label: "High" },
      { value: "mid", label: "Mid" }
    ]
  }
];

export function getModelDef(endpoint: string): HFModelDef | undefined {
  return HF_MODELS.find(m => m.endpoint === endpoint);
}

/** Mapea un aspect ratio neutro al width_and_height permitido más cercano (soul). */
export function aspectToSoulWH(aspect?: string, quality?: string): string {
  const hi = quality === "1080p";
  const map: Record<string, string> = {
    "9:16": "1152x2048",
    "16:9": "2048x1152",
    "1:1": hi ? "2048x2048" : "1536x1536",
    "3:4": "1536x2048",
    "4:3": "2048x1536"
  };
  return map[aspect || "9:16"] || "1152x2048";
}
