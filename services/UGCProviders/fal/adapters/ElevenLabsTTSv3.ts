/**
 * Adapter: ElevenLabs Voice v3 — Text-to-Speech
 * fal.ai model: fal-ai/elevenlabs/tts/eleven-v3
 *
 * Voces humanas premium, 70+ idiomas. Partner model — requiere whitelist
 * en algunas cuentas; usa `available: true` por default y deja que el
 * runtime capture 403 si la cuenta no está habilitada.
 *
 * Pricing referencial: ~$0.03 / 1000 caracteres.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const NORMALIZATION_OPTIONS = ["auto", "on", "off"] as const;

const defaultSchema = z.object({
  voice: z.string().default("Rachel"),
  stability: z.number().min(0).max(1).default(0.5),
  language_code: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "ISO 639-1 (e.g. 'en', 'es', 'es-MX')")
    .optional(),
  apply_text_normalization: z.enum(NORMALIZATION_OPTIONS).default("auto"),
  timestamps: z.boolean().optional()
});

const runtimeSchema = defaultSchema.extend({
  text: z.string().min(1).max(10000)
});

export type ElevenLabsTTSv3Defaults = z.infer<typeof defaultSchema>;
export type ElevenLabsTTSv3Runtime = z.infer<typeof runtimeSchema>;

export interface ElevenLabsTTSv3Output {
  audio: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  timestamps?: Array<{ start: number; end: number; text: string }>;
}

export const ElevenLabsTTSv3: FalAdapter<
  ElevenLabsTTSv3Defaults,
  ElevenLabsTTSv3Runtime,
  ElevenLabsTTSv3Output
> = {
  key: "elevenlabs-tts-v3",
  modelId:
    process.env.FAL_MODEL_ELEVENLABS_TTS_V3 ??
    "fal-ai/elevenlabs/tts/eleven-v3",
  type: "text-to-speech",
  category: "text-to-speech",
  inputs: ["text"],
  outputs: ["audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: ElevenLabsTTSv3Runtime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      text: params.text,
      voice: params.voice,
      stability: params.stability,
      apply_text_normalization: params.apply_text_normalization
    };
    if (params.language_code) payload.language_code = params.language_code;
    if (typeof params.timestamps === "boolean") {
      payload.timestamps = params.timestamps;
    }
    return payload;
  },

  mapOutput(raw: unknown): ElevenLabsTTSv3Output {
    const r = raw as {
      audio?: { url?: string };
      timestamps?: ElevenLabsTTSv3Output["timestamps"];
    };
    if (!r?.audio?.url) {
      throw new Error("ElevenLabs TTS v3 output missing audio.url");
    }
    return {
      audio: r.audio as ElevenLabsTTSv3Output["audio"],
      timestamps: r.timestamps
    };
  },

  estimateCostUsd(params: ElevenLabsTTSv3Runtime): number {
    // ~$0.03 / 1000 chars
    const RATE_PER_CHAR = 0.00003;
    return Number((params.text.length * RATE_PER_CHAR).toFixed(4));
  }
};

export default ElevenLabsTTSv3;
