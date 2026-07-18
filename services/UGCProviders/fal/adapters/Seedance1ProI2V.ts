/**
 * Adapter: Seedance 1.0 Pro (ByteDance)
 * fal.ai model: fal-ai/bytedance/seedance/v1/pro/image-to-video
 *
 * Image-to-video estándar con duración configurable y audio nativo.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12"
] as const;

const ASPECT_RATIO_OPTIONS = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "auto"
] as const;

const RESOLUTION_OPTIONS = ["480p", "720p", "1080p"] as const;

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("5"),
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("auto"),
  resolution: z.enum(RESOLUTION_OPTIONS).default("1080p"),
  camera_fixed: z.boolean().default(false),
  enable_safety_checker: z.boolean().default(true),
  seed: z.number().int().nonnegative().optional()
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800),
  image_url: z.string().url(),
  end_image_url: z.string().url().optional()
});

export type Seedance1ProI2VDefaults = z.infer<typeof defaultSchema>;
export type Seedance1ProI2VRuntime = z.infer<typeof runtimeSchema>;

export interface Seedance1ProI2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_size?: number;
    file_name?: string;
  };
  seed?: number;
}

export const Seedance1ProI2V: FalAdapter<
  Seedance1ProI2VDefaults,
  Seedance1ProI2VRuntime,
  Seedance1ProI2VOutput
> = {
  key: "seedance-v1-pro-i2v",
  modelId:
    process.env.FAL_MODEL_SEEDANCE_V1_PRO_I2V ??
    "fal-ai/bytedance/seedance/v1/pro/image-to-video",
  type: "image-to-video",
  category: "image-to-video",
  inputs: ["text", "image"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: Seedance1ProI2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: params.image_url,
      duration: params.duration,
      aspect_ratio: params.aspect_ratio,
      resolution: params.resolution,
      camera_fixed: params.camera_fixed,
      enable_safety_checker: params.enable_safety_checker
    };
    if (params.end_image_url) payload.end_image_url = params.end_image_url;
    if (typeof params.seed === "number") payload.seed = params.seed;
    return payload;
  },

  mapOutput(raw: unknown): Seedance1ProI2VOutput {
    const r = raw as { video?: { url?: string }; seed?: number };
    if (!r?.video?.url) {
      throw new Error("Seedance 1.0 Pro output missing video.url");
    }
    return {
      video: r.video as Seedance1ProI2VOutput["video"],
      seed: r.seed
    };
  },

  estimateCostUsd(params: Seedance1ProI2VRuntime): number {
    const seconds = Number(params.duration ?? "5");
    const RATE = 0.05; // ~$0.05/s
    return Number((seconds * RATE).toFixed(2));
  },

  requiresCampaignAssets: ["characterImage"]
};

export default Seedance1ProI2V;
