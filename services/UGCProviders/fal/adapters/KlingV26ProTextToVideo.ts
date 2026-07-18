/**
 * Adapter: Kling 2.6 Pro · Text-to-Video
 * fal.ai model: fal-ai/kling-video/v2.6/pro/text-to-video
 *
 * Versión T2V madura de Kling 2.6. Sin multi_prompt ni shot_type
 * (más simple que v3).
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = ["5", "10"] as const;
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "1:1"] as const;

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("5"),
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("16:9"),
  generate_audio: z.boolean().default(true),
  cfg_scale: z.number().min(0).max(1).default(0.5),
  negative_prompt: z.string().default("blur, distort, and low quality")
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800)
});

export type KlingV26ProT2VDefaults = z.infer<typeof defaultSchema>;
export type KlingV26ProT2VRuntime = z.infer<typeof runtimeSchema>;

export interface KlingV26ProT2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const KlingV26ProTextToVideo: FalAdapter<
  KlingV26ProT2VDefaults,
  KlingV26ProT2VRuntime,
  KlingV26ProT2VOutput
> = {
  key: "kling-v2.6-pro-t2v",
  modelId:
    process.env.FAL_MODEL_KLING_V26_PRO_T2V ??
    "fal-ai/kling-video/v2.6/pro/text-to-video",
  type: "text-to-video",
  category: "text-to-video",
  inputs: ["text"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: KlingV26ProT2VRuntime): Record<string, unknown> {
    return {
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.aspect_ratio,
      generate_audio: params.generate_audio,
      cfg_scale: params.cfg_scale,
      negative_prompt: params.negative_prompt
    };
  },

  mapOutput(raw: unknown): KlingV26ProT2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Kling V2.6 Pro T2V output missing video.url");
    }
    return { video: r.video as KlingV26ProT2VOutput["video"] };
  },

  estimateCostUsd(params: KlingV26ProT2VRuntime): number {
    const seconds = Number(params.duration ?? "5");
    const RATE = 0.07; // ~$0.07/s (más barato que v3)
    return Number((seconds * RATE).toFixed(2));
  }
};

export default KlingV26ProTextToVideo;
