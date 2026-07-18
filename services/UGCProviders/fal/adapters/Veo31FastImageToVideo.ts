/**
 * Adapter: Veo 3.1 Fast · Image-to-Video (Google DeepMind)
 * fal.ai model: fal-ai/veo3.1/fast/image-to-video
 *
 * Variante rápida y económica de Veo 3.1. Mismo schema, pricing ~50%.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = ["4s", "6s", "8s"] as const;
const ASPECT_RATIO_OPTIONS = ["auto", "16:9", "9:16"] as const;
const RESOLUTION_OPTIONS = ["720p", "1080p", "4k"] as const;
const SAFETY_OPTIONS = ["1", "2", "3", "4", "5", "6"] as const;

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("8s"),
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("auto"),
  resolution: z.enum(RESOLUTION_OPTIONS).default("720p"),
  generate_audio: z.boolean().default(true),
  safety_tolerance: z.enum(SAFETY_OPTIONS).default("4"),
  auto_fix: z.boolean().optional(),
  seed: z.number().int().nonnegative().optional()
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800),
  image_url: z.string().url(),
  negative_prompt: z.string().optional()
});

export type Veo31FastI2VDefaults = z.infer<typeof defaultSchema>;
export type Veo31FastI2VRuntime = z.infer<typeof runtimeSchema>;

export interface Veo31FastI2VOutput {
  video: { url: string };
}

export const Veo31FastImageToVideo: FalAdapter<
  Veo31FastI2VDefaults,
  Veo31FastI2VRuntime,
  Veo31FastI2VOutput
> = {
  key: "veo3.1-fast-i2v",
  modelId:
    process.env.FAL_MODEL_VEO31_FAST_I2V ??
    "fal-ai/veo3.1/fast/image-to-video",
  type: "image-to-video",
  category: "image-to-video",
  inputs: ["text", "image"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: Veo31FastI2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: params.image_url,
      duration: params.duration,
      aspect_ratio: params.aspect_ratio,
      resolution: params.resolution,
      generate_audio: params.generate_audio,
      safety_tolerance: params.safety_tolerance
    };
    if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
    if (typeof params.auto_fix === "boolean") payload.auto_fix = params.auto_fix;
    if (typeof params.seed === "number") payload.seed = params.seed;
    return payload;
  },

  mapOutput(raw: unknown): Veo31FastI2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Veo 3.1 Fast output missing video.url");
    }
    return { video: { url: r.video.url } };
  },

  estimateCostUsd(params: Veo31FastI2VRuntime): number {
    const seconds = Number((params.duration ?? "8s").replace(/s$/, ""));
    const RATE = 0.2; // ~50% del Veo 3.1 base
    return Number((seconds * RATE).toFixed(2));
  },

  requiresCampaignAssets: ["characterImage"]
};

export default Veo31FastImageToVideo;
