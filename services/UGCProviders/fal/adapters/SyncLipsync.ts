/**
 * Adapter: Sync.so Lipsync
 * fal.ai model: fal-ai/sync-lipsync
 *
 * Sincronización labial precisa de audio sobre video existente.
 * Variantes de modelo: lipsync-1.9.0-beta (default), 1.8.0, 1.7.1.
 *
 * Pricing referencial: ~$0.05 / segundo de video output.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const MODEL_VARIANT_OPTIONS = [
  "lipsync-1.9.0-beta",
  "lipsync-1.8.0",
  "lipsync-1.7.1"
] as const;

const SYNC_MODE_OPTIONS = [
  "cut_off",
  "loop",
  "bounce",
  "silence",
  "remap"
] as const;

const defaultSchema = z.object({
  model: z.enum(MODEL_VARIANT_OPTIONS).default("lipsync-1.9.0-beta"),
  sync_mode: z.enum(SYNC_MODE_OPTIONS).default("cut_off")
});

const runtimeSchema = defaultSchema.extend({
  video_url: z.string().url(),
  audio_url: z.string().url()
});

export type SyncLipsyncDefaults = z.infer<typeof defaultSchema>;
export type SyncLipsyncRuntime = z.infer<typeof runtimeSchema>;

export interface SyncLipsyncOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const SyncLipsync: FalAdapter<
  SyncLipsyncDefaults,
  SyncLipsyncRuntime,
  SyncLipsyncOutput
> = {
  key: "sync-lipsync",
  modelId: process.env.FAL_MODEL_SYNC_LIPSYNC ?? "fal-ai/sync-lipsync",
  type: "lipsync",
  category: "lipsync",
  inputs: ["video", "audio"],
  outputs: ["video"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: SyncLipsyncRuntime): Record<string, unknown> {
    return {
      model: params.model,
      video_url: params.video_url,
      audio_url: params.audio_url,
      sync_mode: params.sync_mode
    };
  },

  mapOutput(raw: unknown): SyncLipsyncOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Sync Lipsync output missing video.url");
    }
    return { video: r.video as SyncLipsyncOutput["video"] };
  },

  estimateCostUsd(_params: SyncLipsyncRuntime): number {
    // No conocemos la duración del video sin probe — estimamos 5s.
    // Pricing real se persiste en runtime con la respuesta efectiva.
    const SECONDS = 5;
    const RATE = 0.05;
    return Number((SECONDS * RATE).toFixed(2));
  }
};

export default SyncLipsync;
