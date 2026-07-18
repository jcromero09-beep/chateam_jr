/**
 * Adapter: F5-TTS (SWivid)
 * fal.ai model: fal-ai/f5-tts
 *
 * Zero-shot voice cloning desde solo ~6 segundos de muestra. Open source,
 * inglés + chino. Alternativa económica a ElevenLabs.
 *
 * Pricing referencial: ~$0.0001 / segundo de audio output.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const MODEL_TYPE_OPTIONS = ["F5-TTS", "E2-TTS"] as const;

const defaultSchema = z.object({
  model_type: z.enum(MODEL_TYPE_OPTIONS).default("F5-TTS"),
  remove_silence: z.boolean().default(true)
});

const runtimeSchema = defaultSchema.extend({
  gen_text: z.string().min(1).max(5000),
  ref_audio_url: z.string().url(),
  ref_text: z.string().max(2000).default("")
});

export type F5TTSDefaults = z.infer<typeof defaultSchema>;
export type F5TTSRuntime = z.infer<typeof runtimeSchema>;

export interface F5TTSOutput {
  audio_url: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const F5TTS: FalAdapter<F5TTSDefaults, F5TTSRuntime, F5TTSOutput> = {
  key: "f5-tts",
  modelId: process.env.FAL_MODEL_F5_TTS ?? "fal-ai/f5-tts",
  type: "text-to-speech",
  category: "text-to-speech",
  // Necesita texto a generar + audio de referencia para clonar la voz.
  inputs: ["text", "audio"],
  outputs: ["audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: F5TTSRuntime): Record<string, unknown> {
    return {
      gen_text: params.gen_text,
      ref_audio_url: params.ref_audio_url,
      ref_text: params.ref_text,
      model_type: params.model_type,
      remove_silence: params.remove_silence
    };
  },

  mapOutput(raw: unknown): F5TTSOutput {
    const r = raw as { audio_url?: { url?: string } };
    if (!r?.audio_url?.url) {
      throw new Error("F5-TTS output missing audio_url.url");
    }
    return { audio_url: r.audio_url as F5TTSOutput["audio_url"] };
  },

  estimateCostUsd(params: F5TTSRuntime): number {
    // Estimación basada en longitud del gen_text (heurística: ~15 chars/seg
    // de audio en habla natural). Se ajustará cuando fal publique pricing.
    const estSeconds = params.gen_text.length / 15;
    const RATE_PER_SEC = 0.0001;
    return Number((estSeconds * RATE_PER_SEC).toFixed(4));
  },

  // Requiere muestra de voz pregrabada en la campaña (referenced asset).
  requiresCampaignAssets: ["audioReference"]
};

export default F5TTS;
