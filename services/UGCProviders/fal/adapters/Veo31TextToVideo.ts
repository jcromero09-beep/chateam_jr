/**
 * Adapter: Veo 3.1 base · Text-to-Video (Google DeepMind)
 * fal.ai model: fal-ai/veo3.1
 *
 * Premium T2V. ATENCIÓN: aspect_ratio acepta solo '16:9' | '9:16' (NO 'auto').
 * Duration con sufijo 's' como su hermano I2V.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = ["4s", "6s", "8s"] as const;
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;
const RESOLUTION_OPTIONS = ["720p", "1080p", "4k"] as const;
const SAFETY_OPTIONS = ["1", "2", "3", "4", "5", "6"] as const;

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("8s"),
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("16:9"),
  resolution: z.enum(RESOLUTION_OPTIONS).default("720p"),
  generate_audio: z.boolean().default(true),
  safety_tolerance: z.enum(SAFETY_OPTIONS).default("4"),
  auto_fix: z.boolean().default(true),
  seed: z.number().int().nonnegative().optional()
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800),
  negative_prompt: z.string().optional()
});

export type Veo31T2VDefaults = z.infer<typeof defaultSchema>;
export type Veo31T2VRuntime = z.infer<typeof runtimeSchema>;

export interface Veo31T2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const Veo31TextToVideo: FalAdapter<
  Veo31T2VDefaults,
  Veo31T2VRuntime,
  Veo31T2VOutput
> = {
  key: "veo3.1-t2v",
  modelId: process.env.FAL_MODEL_VEO31_T2V ?? "fal-ai/veo3.1",
  type: "text-to-video",
  category: "text-to-video",
  inputs: ["text"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: Veo31T2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio,
      duration: params.duration,
      resolution: params.resolution,
      generate_audio: params.generate_audio,
      safety_tolerance: params.safety_tolerance,
      auto_fix: params.auto_fix
    };
    if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
    if (typeof params.seed === "number") payload.seed = params.seed;
    return payload;
  },

  mapOutput(raw: unknown): Veo31T2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Veo 3.1 T2V output missing video.url");
    }
    return { video: r.video as Veo31T2VOutput["video"] };
  },

  estimateCostUsd(params: Veo31T2VRuntime): number {
    const seconds = Number((params.duration ?? "8s").replace(/s$/, ""));
    const RATE = 0.4; // premium tier
    return Number((seconds * RATE).toFixed(2));
  }
};

export default Veo31TextToVideo;
