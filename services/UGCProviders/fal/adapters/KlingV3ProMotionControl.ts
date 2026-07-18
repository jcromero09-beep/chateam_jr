/**
 * Adapter: Kling 3.0 Pro · Motion Control
 * fal.ai model: fal-ai/kling-video/v3/pro/motion-control
 *
 * Transfiere movimientos desde un video de referencia hacia una imagen
 * de personaje. NO es image-to-video estándar — requiere DOS assets:
 *   - image_url:  imagen del personaje (obligatorio)
 *   - video_url:  video de referencia de movimiento (obligatorio)
 *
 * Por eso `requiresCampaignAssets` incluye "motionReferenceVideo" además
 * de "characterImage", y el validador del endpoint PATCH devuelve 422 si
 * la campaña no tiene videoModelMotionReferenceUrl configurado.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

// --------------------------------------------------------------------------
// SCHEMAS
// --------------------------------------------------------------------------

/**
 * defaultSchema — lo que el usuario configura y se guarda en
 * UGCCampaign.videoModelDefaults. SIN assets de runtime.
 */
const defaultSchema = z
  .object({
    character_orientation: z.enum(["image", "video"]).default("image"),
    keep_original_sound: z.boolean().default(true),
    // Según la doc oficial de fal.ai para v3 motion-control, solo 1
    // element es soportado en este endpoint y únicamente cuando
    // character_orientation === "video".
    elements: z
      .array(
        z.object({
          image_url: z.string().url(),
          description: z.string().max(200).optional()
        })
      )
      .max(1)
      .optional()
  })
  .superRefine((data, ctx) => {
    if (data.character_orientation === "image" && data.elements?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elements"],
        message:
          "elements solo se permite cuando character_orientation === 'video'"
      });
    }
  });

/**
 * runtimeSchema — defaults + assets resueltos en el pipeline justo antes
 * de fal.queue.submit. Aquí SÍ se exigen image_url + video_url.
 */
const runtimeSchema = z
  .object({
    character_orientation: z.enum(["image", "video"]).default("image"),
    keep_original_sound: z.boolean().default(true),
    elements: z
      .array(
        z.object({
          image_url: z.string().url(),
          description: z.string().max(200).optional()
        })
      )
      .max(1)
      .optional(),
    // El prompt es opcional en motion-control: la doc de fal.ai indica que
    // se puede omitir y el modelo deriva el movimiento solo del video.
    prompt: z.string().min(1).max(800).optional(),
    image_url: z.string().url({ message: "image_url debe ser una URL válida" }),
    video_url: z.string().url({ message: "video_url debe ser una URL válida" })
  })
  .superRefine((data, ctx) => {
    if (data.character_orientation === "image" && data.elements?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elements"],
        message:
          "elements solo se permite cuando character_orientation === 'video'"
      });
    }
  });

// --------------------------------------------------------------------------
// TIPOS INFERIDOS
// --------------------------------------------------------------------------
export type KlingV3MotionControlDefaults = z.infer<typeof defaultSchema>;
export type KlingV3MotionControlRuntime = z.infer<typeof runtimeSchema>;

export interface KlingV3MotionControlOutput {
  video: {
    url: string;
    content_type?: string;
    file_size?: number;
    file_name?: string;
  };
}

// --------------------------------------------------------------------------
// ADAPTER
// --------------------------------------------------------------------------
export const KlingV3ProMotionControl: FalAdapter<
  KlingV3MotionControlDefaults,
  KlingV3MotionControlRuntime,
  KlingV3MotionControlOutput
> = {
  key: "kling-v3-pro-motion-control",
  modelId:
    process.env.FAL_MODEL_KLING_V3_PRO_MOTION_CONTROL ??
    "fal-ai/kling-video/v3/pro/motion-control",
  type: "motion-control",
  category: "video-to-video",
  inputs: ["image", "video"],
  outputs: ["video"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: KlingV3MotionControlRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      image_url: params.image_url,
      video_url: params.video_url,
      character_orientation: params.character_orientation,
      keep_original_sound: params.keep_original_sound
    };
    if (params.prompt) {
      payload.prompt = params.prompt;
    }
    if (params.character_orientation === "video" && params.elements?.length) {
      payload.elements = params.elements;
    }
    return payload;
  },

  mapOutput(raw: unknown): KlingV3MotionControlOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Kling v3 motion-control output missing video.url");
    }
    return { video: r.video as KlingV3MotionControlOutput["video"] };
  },

  estimateCostUsd(_params: KlingV3MotionControlRuntime): number {
    // Motion-control no expone "duration" — siempre genera clip fijo (~5s).
    // Pricing referencial ~$0.10/s.
    const SECONDS = 5;
    const RATE = 0.1;
    return Number((SECONDS * RATE).toFixed(2));
  },

  requiresCampaignAssets: ["characterImage", "motionReferenceVideo"]
};

export default KlingV3ProMotionControl;
