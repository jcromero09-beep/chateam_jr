/**
 * Adapter: LatentSync (ByteDance)
 * fal.ai model: fal-ai/latentsync
 *
 * Lipsync diffusion-based, calidad cinematográfica. Alternativa premium
 * a Sync.so para resultados más naturales en planos cerrados.
 *
 * Pricing referencial: ~$0.06 / segundo.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const LOOP_MODE_OPTIONS = ["pingpong", "loop"] as const;

const defaultSchema = z.object({
  guidance_scale: z.number().min(0).max(5).default(1),
  loop_mode: z.enum(LOOP_MODE_OPTIONS).default("loop"),
  seed: z.number().int().nonnegative().optional()
});

const runtimeSchema = defaultSchema.extend({
  video_url: z.string().url(),
  audio_url: z.string().url()
});

export type LatentSyncDefaults = z.infer<typeof defaultSchema>;
export type LatentSyncRuntime = z.infer<typeof runtimeSchema>;

export interface LatentSyncOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const LatentSync: FalAdapter<
  LatentSyncDefaults,
  LatentSyncRuntime,
  LatentSyncOutput
> = {
  key: "latentsync",
  modelId: process.env.FAL_MODEL_LATENTSYNC ?? "fal-ai/latentsync",
  type: "lipsync",
  category: "lipsync",
  inputs: ["video", "audio"],
  outputs: ["video"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: LatentSyncRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      video_url: params.video_url,
      audio_url: params.audio_url,
      guidance_scale: params.guidance_scale,
      loop_mode: params.loop_mode
    };
    if (typeof params.seed === "number") payload.seed = params.seed;
    return payload;
  },

  mapOutput(raw: unknown): LatentSyncOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("LatentSync output missing video.url");
    }
    return { video: r.video as LatentSyncOutput["video"] };
  },

  estimateCostUsd(_params: LatentSyncRuntime): number {
    const SECONDS = 5;
    const RATE = 0.06;
    return Number((SECONDS * RATE).toFixed(2));
  }
};

export default LatentSync;
