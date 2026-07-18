/**
 * Adapter: Kling 3.0 Pro · Image-to-Video
 * fal.ai model: fal-ai/kling-video/v3/pro/image-to-video
 *
 * Image-to-video top-tier con audio nativo. ATENCIÓN: el campo de input
 * es `start_image_url`, NO `image_url` (diferencia respecto a Seedance/Veo).
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = [
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
] as const;

const SHOT_TYPE_OPTIONS = ["customize", "intelligent"] as const;

const multiPromptElement = z.object({
  prompt: z.string().min(1).max(800),
  // tiempo en segundos donde aplica el prompt
  start_time: z.number().nonnegative().optional(),
  end_time: z.number().positive().optional()
});

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("5"),
  generate_audio: z.boolean().default(true),
  cfg_scale: z.number().min(0).max(1).default(0.5),
  negative_prompt: z.string().default("blur, distort, and low quality"),
  shot_type: z.enum(SHOT_TYPE_OPTIONS).default("customize")
});

/**
 * Runtime: prompt y multi_prompt son mutuamente exclusivos.
 * Al menos uno debe proveerse.
 */
const runtimeSchema = defaultSchema
  .extend({
    prompt: z.string().min(1).max(800).optional(),
    multi_prompt: z.array(multiPromptElement).min(1).max(8).optional(),
    start_image_url: z.string().url(),
    end_image_url: z.string().url().optional()
  })
  .superRefine((data, ctx) => {
    if (data.prompt && data.multi_prompt?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["multi_prompt"],
        message: "prompt y multi_prompt son mutuamente exclusivos"
      });
    }
    if (!data.prompt && !data.multi_prompt?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Debes proveer prompt o multi_prompt"
      });
    }
  });

export type KlingV3ProI2VDefaults = z.infer<typeof defaultSchema>;
export type KlingV3ProI2VRuntime = z.infer<typeof runtimeSchema>;

export interface KlingV3ProI2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_size?: number;
    file_name?: string;
  };
}

export const KlingV3ProI2V: FalAdapter<
  KlingV3ProI2VDefaults,
  KlingV3ProI2VRuntime,
  KlingV3ProI2VOutput
> = {
  key: "kling-v3-pro-i2v",
  modelId:
    process.env.FAL_MODEL_KLING_V3_PRO_I2V ??
    "fal-ai/kling-video/v3/pro/image-to-video",
  type: "image-to-video",
  category: "image-to-video",
  inputs: ["text", "image"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: KlingV3ProI2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      start_image_url: params.start_image_url,
      duration: params.duration,
      generate_audio: params.generate_audio,
      cfg_scale: params.cfg_scale,
      negative_prompt: params.negative_prompt,
      shot_type: params.shot_type
    };
    if (params.prompt) payload.prompt = params.prompt;
    if (params.multi_prompt?.length) payload.multi_prompt = params.multi_prompt;
    if (params.end_image_url) payload.end_image_url = params.end_image_url;
    return payload;
  },

  mapOutput(raw: unknown): KlingV3ProI2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Kling v3 Pro I2V output missing video.url");
    }
    return { video: r.video as KlingV3ProI2VOutput["video"] };
  },

  estimateCostUsd(params: KlingV3ProI2VRuntime): number {
    const seconds = Number(params.duration ?? "5");
    const RATE = 0.07; // ~$0.07/s
    return Number((seconds * RATE).toFixed(2));
  },

  requiresCampaignAssets: ["characterImage"]
};

export default KlingV3ProI2V;
