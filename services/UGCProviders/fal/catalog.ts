/**
 * Catálogo estático de modelos fal.ai disponibles para UGC.
 *
 * Sirve dos propósitos:
 *  1. Source-of-truth para el endpoint público GET /ugc/fal-models.
 *  2. Documentación legible de qué adapters existen sin abrir cada archivo.
 *
 * IMPORTANTE: este catálogo es estático y NO hace requests a fal.ai. Las
 * URLs de preview apuntan a assets públicos de fal-public-storage que
 * cargan gratis y no consumen créditos.
 *
 * PR #2: agrega `category`, `inputs`, `outputs`, `available` por entry.
 * `type` se mantiene para retrocompat con clientes del PR #1 — `category`
 * es la nueva fuente de verdad usada por el wizard del Pipeline Builder.
 *
 * Verificado el 2026-05-13 (PR #1) y 2026-05-14 (PR #2).
 */

export type FalModelType =
  | "image-to-video"
  | "motion-control"
  | "image-edit"
  | "text-to-image"
  | "text-to-video"
  | "text-to-speech"
  | "lipsync";

/** Categoría estricta — fuente de verdad para filtrar en wizard (PR #2). */
export type FalModelCategory =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "text-to-speech"
  | "lipsync";

/** Tipos de I/O usados en la línea visual "X + Y → Z". */
export type FalIOType = "text" | "image" | "video" | "audio";

export type FalCampaignAsset =
  | "characterImage"
  | "motionReferenceVideo"
  | "endImage"
  | "audioReference";

export interface FalConfigurableField {
  name: string;
  type: "enum" | "string" | "boolean" | "integer" | "number";
  default: string | number | boolean;
  options?: ReadonlyArray<string>;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface FalCatalogEntry {
  key: string;
  displayName: string;
  vendor: string;
  modelId: string;
  envOverride?: string;
  /** Alias retrocompat PR #1 — prefiere `category`. */
  type: FalModelType;
  /** Categoría estricta PR #2 — usar para filtros del wizard. */
  category: FalModelCategory;
  /** Qué entradas recibe (renderizado como chips en la UI). */
  inputs: ReadonlyArray<FalIOType>;
  /** Qué salidas produce. */
  outputs: ReadonlyArray<FalIOType>;
  /** Si el modelo está disponible para selección pública. */
  available: boolean;
  description: string;
  previewVideoUrl: string | null;
  previewImageUrl: string | null;
  previewImageBeforeUrl?: string;
  previewImageAfterUrl?: string;
  previewAudioUrl?: string | null;
  exampleInputUrls?: Record<string, string>;
  pricing: {
    unit: "second" | "image" | "character";
    estimateUsd: number;
    displayLabel: string;
  };
  configurableFields: ReadonlyArray<FalConfigurableField>;
  defaults: Record<string, unknown>;
  recommended: boolean;
  tags: ReadonlyArray<string>;
  playgroundUrl: string;
  requiresCampaignAssets: ReadonlyArray<FalCampaignAsset>;
}

/**
 * Resuelve el modelId final aplicando override de env si existe.
 */
export function resolveCatalogModelId(entry: FalCatalogEntry): string {
  if (entry.envOverride) {
    const fromEnv = process.env[entry.envOverride];
    if (typeof fromEnv === "string" && fromEnv.trim()) {
      return fromEnv.trim();
    }
  }
  return entry.modelId;
}

export const FAL_MODEL_CATALOG: ReadonlyArray<FalCatalogEntry> = [
  // =====================================================================
  // PR #1 — Image-to-Video
  // =====================================================================
  {
    key: "seedance-v1-pro-i2v",
    displayName: "Seedance 1.0 Pro",
    vendor: "ByteDance",
    modelId: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    envOverride: "FAL_MODEL_SEEDANCE_V1_PRO_I2V",
    type: "image-to-video",
    category: "image-to-video",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "High-quality video generation model by ByteDance. Strong cinematic output, native audio, real-world physics.",
    previewVideoUrl:
      "https://storage.googleapis.com/falserverless/example_inputs/seedance_pro_i2v.mp4",
    previewImageUrl:
      "https://storage.googleapis.com/falserverless/example_inputs/seedance_pro_i2v_img.jpg",
    pricing: { unit: "second", estimateUsd: 0.05, displayLabel: "$0.05 / s" },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        default: "5"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"],
        default: "auto"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["480p", "720p", "1080p"],
        default: "1080p"
      },
      { name: "camera_fixed", type: "boolean", default: false }
    ],
    defaults: {
      duration: "5",
      aspect_ratio: "auto",
      resolution: "1080p",
      camera_fixed: false
    },
    recommended: true,
    tags: ["cinematic", "native-audio", "ugc"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/image-to-video",
    requiresCampaignAssets: ["characterImage"]
  },
  {
    key: "kling-v3-pro-i2v",
    displayName: "Kling 3.0 Pro",
    vendor: "Kuaishou",
    modelId: "fal-ai/kling-video/v3/pro/image-to-video",
    envOverride: "FAL_MODEL_KLING_V3_PRO_I2V",
    type: "image-to-video",
    category: "image-to-video",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation. Soporta multi-prompt shots.",
    previewVideoUrl:
      "https://storage.googleapis.com/falserverless/example_outputs/kling-v3/pro-i2v/out.mp4",
    previewImageUrl:
      "https://storage.googleapis.com/falserverless/example_inputs/kling-v3/pro-i2v/start_image.png",
    pricing: { unit: "second", estimateUsd: 0.07, displayLabel: "~$0.07 / s" },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: [
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15"
        ],
        default: "5"
      },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "cfg_scale",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5
      },
      {
        name: "negative_prompt",
        type: "string",
        default: "blur, distort, and low quality"
      },
      {
        name: "shot_type",
        type: "enum",
        options: ["customize", "intelligent"],
        default: "customize"
      }
    ],
    defaults: {
      duration: "5",
      generate_audio: true,
      cfg_scale: 0.5,
      negative_prompt: "blur, distort, and low quality",
      shot_type: "customize"
    },
    recommended: true,
    tags: ["cinematic", "native-audio", "multi-shot"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video",
    requiresCampaignAssets: ["characterImage"]
  },
  {
    key: "kling-v3-pro-motion-control",
    displayName: "Kling 3.0 Pro · Motion Control",
    vendor: "Kuaishou",
    modelId: "fal-ai/kling-video/v3/pro/motion-control",
    envOverride: "FAL_MODEL_KLING_V3_PRO_MOTION_CONTROL",
    type: "motion-control",
    category: "video-to-video",
    inputs: ["image", "video"],
    outputs: ["video"],
    available: true,
    description:
      "Transfer movements from a reference video to any character image. Facial consistency binding.",
    previewVideoUrl:
      "https://v3b.fal.media/files/b/0a90ffb9/CnmmxIvK05VAq4gG8WiEQ_output.mp4",
    previewImageUrl:
      "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
    pricing: { unit: "second", estimateUsd: 0.1, displayLabel: "~$0.10 / s" },
    configurableFields: [
      {
        name: "character_orientation",
        type: "enum",
        options: ["image", "video"],
        default: "image"
      },
      { name: "keep_original_sound", type: "boolean", default: true }
    ],
    defaults: {
      character_orientation: "image",
      keep_original_sound: true
    },
    recommended: false,
    tags: ["motion-transfer", "character-consistency", "dance"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control",
    requiresCampaignAssets: ["characterImage", "motionReferenceVideo"]
  },
  {
    key: "kling-v2.6-pro-i2v",
    displayName: "Kling 2.6 Pro",
    vendor: "Kuaishou",
    modelId: "fal-ai/kling-video/v2.6/pro/image-to-video",
    envOverride: "FAL_MODEL_KLING_V26_PRO_I2V",
    type: "image-to-video",
    category: "image-to-video",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Mature, stable, slightly cheaper than v3. Cinematic visuals, fluid motion, audio nativo.",
    previewVideoUrl:
      "https://v3b.fal.media/files/b/0a84ab51/Qr1twf8UgtD5rZHpNXC2P_output.mp4",
    previewImageUrl:
      "https://v3b.fal.media/files/b/0a84ab29/BSJXz9Ht-jgRgMf4IGxLU_upscaled.png",
    pricing: { unit: "second", estimateUsd: 0.06, displayLabel: "~$0.06 / s" },
    configurableFields: [
      { name: "duration", type: "enum", options: ["5", "10"], default: "5" },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "negative_prompt",
        type: "string",
        default: "blur, distort, and low quality"
      }
    ],
    defaults: {
      duration: "5",
      generate_audio: true,
      negative_prompt: "blur, distort, and low quality"
    },
    recommended: true,
    tags: ["cinematic", "native-audio", "cost-effective"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video",
    requiresCampaignAssets: ["characterImage"]
  },
  {
    key: "veo3.1-i2v",
    displayName: "Veo 3.1",
    vendor: "Google DeepMind",
    modelId: "fal-ai/veo3.1/image-to-video",
    envOverride: "FAL_MODEL_VEO31_I2V",
    type: "image-to-video",
    category: "image-to-video",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Google's latest state-of-the-art. Mejor realismo, native audio, 4K. Premium pricing.",
    previewVideoUrl:
      "https://storage.googleapis.com/falserverless/model_tests/gallery/veo3-1-i2v.mp4",
    previewImageUrl:
      "https://storage.googleapis.com/falserverless/example_inputs/veo31_i2v_input.jpg",
    pricing: {
      unit: "second",
      estimateUsd: 0.4,
      displayLabel: "$0.40 / s (premium)"
    },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: ["4s", "6s", "8s"],
        default: "8s"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["auto", "16:9", "9:16"],
        default: "auto"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["720p", "1080p", "4k"],
        default: "720p"
      },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "safety_tolerance",
        type: "enum",
        options: ["1", "2", "3", "4", "5", "6"],
        default: "4"
      }
    ],
    defaults: {
      duration: "8s",
      aspect_ratio: "auto",
      resolution: "720p",
      generate_audio: true,
      safety_tolerance: "4"
    },
    recommended: false,
    tags: ["premium", "top-realism", "hero-shot", "4k-capable"],
    playgroundUrl: "https://fal.ai/models/fal-ai/veo3.1/image-to-video",
    requiresCampaignAssets: ["characterImage"]
  },
  {
    key: "nano-banana-2-edit",
    displayName: "Nano Banana 2 Edit",
    vendor: "Google (Gemini 3.1 Flash Image)",
    modelId: "fal-ai/nano-banana-2/edit",
    envOverride: "FAL_MODEL_NANO_BANANA_2_EDIT",
    type: "image-edit",
    category: "image-to-image",
    inputs: ["text", "image"],
    outputs: ["image"],
    available: true,
    description:
      "Google's SOTA image editing. Multi-image input, extreme aspect ratios. Typography premium.",
    previewVideoUrl:
      "https://v3b.fal.media/files/b/kangaroo/oUCiZjQwEy6bIQdPUSLDF_output.mp4",
    previewImageUrl:
      "https://storage.googleapis.com/falserverless/example_outputs/nano-banana-2-edit-output.png",
    previewImageBeforeUrl:
      "https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png",
    previewImageAfterUrl:
      "https://storage.googleapis.com/falserverless/example_outputs/nano-banana-2-edit-output.png",
    pricing: {
      unit: "image",
      estimateUsd: 0.04,
      displayLabel: "$0.04 / img (1K)"
    },
    configurableFields: [
      {
        name: "aspect_ratio",
        type: "enum",
        options: [
          "auto",
          "21:9",
          "16:9",
          "3:2",
          "4:3",
          "5:4",
          "1:1",
          "4:5",
          "3:4",
          "2:3",
          "9:16",
          "4:1",
          "1:4",
          "8:1",
          "1:8"
        ],
        default: "auto"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K"
      },
      {
        name: "output_format",
        type: "enum",
        options: ["jpeg", "png", "webp"],
        default: "png"
      },
      { name: "num_images", type: "integer", min: 1, max: 4, default: 1 }
    ],
    defaults: {
      aspect_ratio: "auto",
      resolution: "1K",
      output_format: "png",
      num_images: 1,
      limit_generations: true
    },
    recommended: true,
    tags: ["character-consistency", "image-edit", "multi-image", "typography"],
    playgroundUrl: "https://fal.ai/models/fal-ai/nano-banana-2/edit",
    requiresCampaignAssets: ["characterImage"]
  },

  // =====================================================================
  // PR #2 — Text-to-Image
  // =====================================================================
  {
    key: "nano-banana-2",
    displayName: "Nano Banana 2",
    vendor: "Google (Gemini 3.1 Flash Image)",
    modelId: "fal-ai/nano-banana-2",
    envOverride: "FAL_MODEL_NANO_BANANA_2",
    type: "text-to-image",
    category: "text-to-image",
    inputs: ["text"],
    outputs: ["image"],
    available: true,
    description:
      "Google's SOTA fast text-to-image. Excelente realismo, typography, extreme aspect ratios (4:1 a 1:8). Misma familia que Nano Banana 2 Edit pero genera desde texto.",
    previewVideoUrl:
      "https://storage.googleapis.com/falserverless/example_outputs/kling-v3/pro-t2v/out.mp4",
    previewImageUrl:
      "https://storage.googleapis.com/falserverless/example_outputs/nano-banana-2-t2i-output.png",
    pricing: {
      unit: "image",
      estimateUsd: 0.04,
      displayLabel: "$0.04 / img (1K)"
    },
    configurableFields: [
      {
        name: "aspect_ratio",
        type: "enum",
        options: [
          "auto",
          "21:9",
          "16:9",
          "3:2",
          "4:3",
          "5:4",
          "1:1",
          "4:5",
          "3:4",
          "2:3",
          "9:16",
          "4:1",
          "1:4",
          "8:1",
          "1:8"
        ],
        default: "auto"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K"
      },
      {
        name: "output_format",
        type: "enum",
        options: ["jpeg", "png", "webp"],
        default: "png"
      },
      { name: "num_images", type: "integer", min: 1, max: 4, default: 1 }
    ],
    defaults: {
      aspect_ratio: "9:16",
      resolution: "1K",
      output_format: "png",
      num_images: 1,
      limit_generations: true
    },
    recommended: true,
    tags: ["typography", "photorealism", "extreme-ratios"],
    playgroundUrl: "https://fal.ai/models/fal-ai/nano-banana-2",
    requiresCampaignAssets: []
  },

  // =====================================================================
  // PR #2 — Text-to-Video
  // =====================================================================
  {
    key: "veo3.1-t2v",
    displayName: "Veo 3.1 · Text-to-Video",
    vendor: "Google DeepMind",
    modelId: "fal-ai/veo3.1",
    envOverride: "FAL_MODEL_VEO31_T2V",
    type: "text-to-video",
    category: "text-to-video",
    inputs: ["text"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Veo 3.1 directo desde texto, sin necesidad de imagen base. Native audio, 4K, mejor realismo del mercado.",
    previewVideoUrl:
      "https://v3b.fal.media/files/b/0a84ab71/8hPbLs7n59WhWY-BN69yX_output.mp4",
    previewImageUrl: null,
    pricing: {
      unit: "second",
      estimateUsd: 0.4,
      displayLabel: "$0.40 / s (premium)"
    },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: ["4s", "6s", "8s"],
        default: "8s"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["16:9", "9:16"],
        default: "9:16"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["720p", "1080p", "4k"],
        default: "720p"
      },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "safety_tolerance",
        type: "enum",
        options: ["1", "2", "3", "4", "5", "6"],
        default: "4"
      }
    ],
    defaults: {
      duration: "8s",
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: true,
      safety_tolerance: "4",
      auto_fix: true
    },
    recommended: false,
    tags: ["premium", "top-realism", "no-image-needed"],
    playgroundUrl: "https://fal.ai/models/fal-ai/veo3.1",
    requiresCampaignAssets: []
  },
  {
    key: "kling-v3-pro-t2v",
    displayName: "Kling 3.0 Pro · Text-to-Video",
    vendor: "Kuaishou",
    modelId: "fal-ai/kling-video/v3/pro/text-to-video",
    envOverride: "FAL_MODEL_KLING_V3_PRO_T2V",
    type: "text-to-video",
    category: "text-to-video",
    inputs: ["text"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Kling 3.0 Pro generando video directo de texto, sin imagen. Cinematic, audio nativo, multi-shot.",
    previewVideoUrl: null,
    previewImageUrl: null,
    pricing: { unit: "second", estimateUsd: 0.08, displayLabel: "~$0.08 / s" },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: [
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15"
        ],
        default: "5"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["16:9", "9:16", "1:1"],
        default: "9:16"
      },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "cfg_scale",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5
      },
      {
        name: "negative_prompt",
        type: "string",
        default: "blur, distort, and low quality"
      },
      {
        name: "shot_type",
        type: "enum",
        options: ["customize", "intelligent"],
        default: "customize"
      }
    ],
    defaults: {
      duration: "5",
      aspect_ratio: "9:16",
      generate_audio: true,
      cfg_scale: 0.5,
      negative_prompt: "blur, distort, and low quality",
      shot_type: "customize"
    },
    recommended: true,
    tags: ["cinematic", "native-audio", "no-image-needed"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video",
    requiresCampaignAssets: []
  },
  {
    key: "kling-v2.6-pro-t2v",
    displayName: "Kling 2.6 Pro · Text-to-Video",
    vendor: "Kuaishou",
    modelId: "fal-ai/kling-video/v2.6/pro/text-to-video",
    envOverride: "FAL_MODEL_KLING_V26_PRO_T2V",
    type: "text-to-video",
    category: "text-to-video",
    inputs: ["text"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Kling 2.6 Pro desde texto. Modelo maduro, ligeramente más barato que v3, audio nativo.",
    previewVideoUrl: null,
    previewImageUrl: null,
    pricing: { unit: "second", estimateUsd: 0.07, displayLabel: "~$0.07 / s" },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: ["5", "10"],
        default: "5"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["16:9", "9:16", "1:1"],
        default: "9:16"
      },
      { name: "generate_audio", type: "boolean", default: true },
      {
        name: "cfg_scale",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5
      },
      {
        name: "negative_prompt",
        type: "string",
        default: "blur, distort, and low quality"
      }
    ],
    defaults: {
      duration: "5",
      aspect_ratio: "9:16",
      generate_audio: true,
      cfg_scale: 0.5,
      negative_prompt: "blur, distort, and low quality"
    },
    recommended: false,
    tags: ["cinematic", "native-audio", "cost-effective"],
    playgroundUrl:
      "https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video",
    requiresCampaignAssets: []
  },

  // =====================================================================
  // PR #2 — Image-to-Video variant
  // =====================================================================
  {
    key: "veo3.1-fast-i2v",
    displayName: "Veo 3.1 Fast",
    vendor: "Google DeepMind",
    modelId: "fal-ai/veo3.1/fast/image-to-video",
    envOverride: "FAL_MODEL_VEO31_FAST_I2V",
    type: "image-to-video",
    category: "image-to-video",
    inputs: ["text", "image"],
    outputs: ["video", "audio"],
    available: true,
    description:
      "Variante rápida y económica del Veo 3.1 con calidad similar. Ideal para A/B testing y variantes.",
    previewVideoUrl:
      "https://storage.googleapis.com/falserverless/model_tests/gallery/veo3-1-i2v.mp4",
    previewImageUrl: null,
    pricing: {
      unit: "second",
      estimateUsd: 0.2,
      displayLabel: "~$0.20 / s"
    },
    configurableFields: [
      {
        name: "duration",
        type: "enum",
        options: ["4s", "6s", "8s"],
        default: "8s"
      },
      {
        name: "aspect_ratio",
        type: "enum",
        options: ["auto", "16:9", "9:16"],
        default: "auto"
      },
      {
        name: "resolution",
        type: "enum",
        options: ["720p", "1080p", "4k"],
        default: "720p"
      },
      { name: "generate_audio", type: "boolean", default: true }
    ],
    defaults: {
      duration: "8s",
      aspect_ratio: "auto",
      resolution: "720p",
      generate_audio: true
    },
    recommended: true,
    tags: ["fast", "cost-effective", "high-quality"],
    playgroundUrl: "https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video",
    requiresCampaignAssets: ["characterImage"]
  },

  // =====================================================================
  // PR #2 — Text-to-Speech
  // =====================================================================
  {
    key: "elevenlabs-tts-v3",
    displayName: "ElevenLabs Voice v3",
    vendor: "ElevenLabs",
    modelId: "fal-ai/elevenlabs/tts/eleven-v3",
    envOverride: "FAL_MODEL_ELEVENLABS_TTS_V3",
    type: "text-to-speech",
    category: "text-to-speech",
    inputs: ["text"],
    outputs: ["audio"],
    available: true,
    description:
      "Voces humanas premium en 70+ idiomas, control emocional. La mejor opción para UGC scripted profesional.",
    previewVideoUrl: null,
    previewImageUrl: null,
    previewAudioUrl:
      "https://v3.fal.media/files/zebra/zJL_oRY8h5RWwjoK1w7tx_output.mp3",
    pricing: {
      unit: "character",
      estimateUsd: 0.00003,
      displayLabel: "~$0.03 / 1000 chars"
    },
    configurableFields: [
      { name: "voice", type: "string", default: "Rachel" },
      {
        name: "stability",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5
      },
      { name: "language_code", type: "string", default: "" },
      {
        name: "apply_text_normalization",
        type: "enum",
        options: ["auto", "on", "off"],
        default: "auto"
      },
      { name: "timestamps", type: "boolean", default: false }
    ],
    defaults: {
      voice: "Rachel",
      stability: 0.5,
      apply_text_normalization: "auto"
    },
    recommended: true,
    tags: ["voice-clone", "multilingual", "professional"],
    playgroundUrl: "https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3",
    requiresCampaignAssets: []
  },
  {
    key: "f5-tts",
    displayName: "F5-TTS",
    vendor: "SWivid",
    modelId: "fal-ai/f5-tts",
    envOverride: "FAL_MODEL_F5_TTS",
    type: "text-to-speech",
    category: "text-to-speech",
    inputs: ["text", "audio"],
    outputs: ["audio"],
    available: true,
    description:
      "Zero-shot voice cloning desde ~6 segundos de muestra. Open source, inglés + chino. Económico.",
    previewVideoUrl: null,
    previewImageUrl: null,
    previewAudioUrl:
      "https://v2.fal.media/files/8535dd59e911496a947daa35c07e67a3_tmplkcy6tut.wav",
    exampleInputUrls: {
      audioReference:
        "https://storage.googleapis.com/falserverless/example_inputs/reference_audio.wav"
    },
    pricing: {
      unit: "second",
      estimateUsd: 0.0001,
      displayLabel: "~$0.10 / 1000 s"
    },
    configurableFields: [
      {
        name: "model_type",
        type: "enum",
        options: ["F5-TTS", "E2-TTS"],
        default: "F5-TTS"
      },
      { name: "remove_silence", type: "boolean", default: true }
    ],
    defaults: { model_type: "F5-TTS", remove_silence: true },
    recommended: false,
    tags: ["open-source", "voice-clone", "zero-shot", "budget"],
    playgroundUrl: "https://fal.ai/models/fal-ai/f5-tts",
    requiresCampaignAssets: ["audioReference"]
  },

  // =====================================================================
  // PR #2 — Lipsync
  // =====================================================================
  {
    key: "sync-lipsync",
    displayName: "Sync.so Lipsync",
    vendor: "Sync",
    modelId: "fal-ai/sync-lipsync",
    envOverride: "FAL_MODEL_SYNC_LIPSYNC",
    type: "lipsync",
    category: "lipsync",
    inputs: ["video", "audio"],
    outputs: ["video"],
    available: true,
    description:
      "Sincronización labial precisa de audio sobre video existente. El más usado en UGC profesional.",
    previewVideoUrl:
      "https://v3b.fal.media/files/b/0a93c312/TqKMiLtCcTKWSeAWXJRD0_output.mp4",
    previewImageUrl: null,
    exampleInputUrls: {
      video:
        "https://v3.fal.media/files/tiger/IugLCDJRIoGqvqTa-EJTr_3wg74vCqyNuQ-IiBd77MM_output.mp4",
      audio: "https://fal.media/files/lion/vyFWygmZsIZlUO4s0nr2n.wav"
    },
    pricing: { unit: "second", estimateUsd: 0.05, displayLabel: "~$0.05 / s" },
    configurableFields: [
      {
        name: "model",
        type: "enum",
        options: ["lipsync-1.9.0-beta", "lipsync-1.8.0", "lipsync-1.7.1"],
        default: "lipsync-1.9.0-beta"
      },
      {
        name: "sync_mode",
        type: "enum",
        options: ["cut_off", "loop", "bounce", "silence", "remap"],
        default: "cut_off"
      }
    ],
    defaults: { model: "lipsync-1.9.0-beta", sync_mode: "cut_off" },
    recommended: true,
    tags: ["talking-head", "precision", "production-grade"],
    playgroundUrl: "https://fal.ai/models/fal-ai/sync-lipsync",
    requiresCampaignAssets: []
  },
  {
    key: "latentsync",
    displayName: "LatentSync",
    vendor: "ByteDance",
    modelId: "fal-ai/latentsync",
    envOverride: "FAL_MODEL_LATENTSYNC",
    type: "lipsync",
    category: "lipsync",
    inputs: ["video", "audio"],
    outputs: ["video"],
    available: true,
    description:
      "Diffusion-based lipsync de ByteDance. Calidad visual top, ideal cuando el resultado debe verse cinematográfico.",
    previewVideoUrl: null,
    previewImageUrl: null,
    exampleInputUrls: {
      video: "https://fal.media/files/koala/8teUPbRRMtAUTORDvqy0l.mp4"
    },
    pricing: { unit: "second", estimateUsd: 0.06, displayLabel: "~$0.06 / s" },
    configurableFields: [
      {
        name: "guidance_scale",
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        default: 1
      },
      {
        name: "loop_mode",
        type: "enum",
        options: ["pingpong", "loop"],
        default: "loop"
      }
    ],
    defaults: { guidance_scale: 1, loop_mode: "loop" },
    recommended: false,
    tags: ["diffusion", "cinematic-quality"],
    playgroundUrl: "https://fal.ai/models/fal-ai/latentsync",
    requiresCampaignAssets: []
  }
] as const;

/** Lista de keys conocidas. */
export const FAL_MODEL_KEYS = FAL_MODEL_CATALOG.map(m => m.key);

/** Versión del catálogo — bump cuando cambien IDs o defaults. */
export const FAL_CATALOG_VERSION = "2026-05-14";
