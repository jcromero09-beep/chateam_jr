/**
 * Adapter: Kling 2.6 Pro · Image-to-Video
 * fal.ai model: fal-ai/kling-video/v2.6/pro/image-to-video
 *
 * Versión madura y cost-effective de Kling. Solo dos duraciones: 5s | 10s.
 * Campo de input: `start_image_url` (igual que v3, NO `image_url`).
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = ["5", "10"] as const;

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("5"),
  generate_audio: z.boolean().default(true),
  negative_prompt: z.string().default("blur, distort, and low quality"),
  voice_ids: z.array(z.string()).max(2).optional()
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800),
  start_image_url: z.string().url(),
  end_image_url: z.string().url().optional()
});

export type KlingV26ProI2VDefaults = z.infer<typeof defaultSchema>;
export type KlingV26ProI2VRuntime = z.infer<typeof runtimeSchema>;

export interface KlingV26ProI2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_size?: number;
    file_name?: string;
  };
}

export const KlingV26ProI2V: FalAdapter<
  KlingV26ProI2VDefaults,
  KlingV26ProI2VRuntime,
  KlingV26ProI2VOutput
> = {
  key: "kling-v2.6-pro-i2v",
  modelId:
    process.env.FAL_MODEL_KLING_V26_PRO_I2V ??
    "fal-ai/kling-video/v2.6/pro/image-to-video",
  type: "image-to-video",
  category: "image-to-video",
  inputs: ["text", "image"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: KlingV26ProI2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      start_image_url: params.start_image_url,
      duration: params.duration,
      generate_audio: params.generate_audio,
      negative_prompt: params.negative_prompt
    };
    if (params.voice_ids?.length) payload.voice_ids = params.voice_ids;
    if (params.end_image_url) payload.end_image_url = params.end_image_url;
    return payload;
  },

  mapOutput(raw: unknown): KlingV26ProI2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Kling v2.6 Pro I2V output missing video.url");
    }
    return { video: r.video as KlingV26ProI2VOutput["video"] };
  },

  estimateCostUsd(params: KlingV26ProI2VRuntime): number {
    const seconds = Number(params.duration ?? "5");
    const RATE = 0.06; // ~$0.06/s
    return Number((seconds * RATE).toFixed(2));
  },

  requiresCampaignAssets: ["characterImage"]
};

export default KlingV26ProI2V;
