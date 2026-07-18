/**
 * Adapter: Nano Banana 2 (Google — Gemini 3.1 Flash Image, base text-to-image)
 * fal.ai model: fal-ai/nano-banana-2
 *
 * Hermano del NanoBanana2Edit (PR #1). Mismo pricing/resoluciones, pero
 * solo recibe prompt — no image_urls.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const ASPECT_RATIO_OPTIONS = [
  "auto",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
  "4:1",
  "1:4",
  "8:1",
  "1:8"
] as const;

const RESOLUTION_OPTIONS = ["0.5K", "1K", "2K", "4K"] as const;
const OUTPUT_FORMAT_OPTIONS = ["jpeg", "png", "webp"] as const;
const SAFETY_OPTIONS = ["1", "2", "3", "4", "5", "6"] as const;
const THINKING_OPTIONS = ["minimal", "high"] as const;

const defaultSchema = z.object({
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("auto"),
  resolution: z.enum(RESOLUTION_OPTIONS).default("1K"),
  output_format: z.enum(OUTPUT_FORMAT_OPTIONS).default("png"),
  num_images: z.number().int().min(1).max(4).default(1),
  safety_tolerance: z.enum(SAFETY_OPTIONS).default("4"),
  limit_generations: z.boolean().default(true),
  enable_web_search: z.boolean().default(false),
  thinking_level: z.enum(THINKING_OPTIONS).default("minimal"),
  seed: z.number().int().nonnegative().optional()
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(2000),
  system_prompt: z.string().max(2000).optional()
});

export type NanoBanana2Defaults = z.infer<typeof defaultSchema>;
export type NanoBanana2Runtime = z.infer<typeof runtimeSchema>;

export interface NanoBanana2Output {
  images: Array<{
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
  description?: string;
}

const RESOLUTION_MULTIPLIER: Record<
  (typeof RESOLUTION_OPTIONS)[number],
  number
> = {
  "0.5K": 0.75,
  "1K": 1,
  "2K": 1.5,
  "4K": 2
};

export const NanoBanana2: FalAdapter<
  NanoBanana2Defaults,
  NanoBanana2Runtime,
  NanoBanana2Output
> = {
  key: "nano-banana-2",
  modelId: process.env.FAL_MODEL_NANO_BANANA_2 ?? "fal-ai/nano-banana-2",
  type: "text-to-image",
  category: "text-to-image",
  inputs: ["text"],
  outputs: ["image"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: NanoBanana2Runtime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio,
      resolution: params.resolution,
      output_format: params.output_format,
      num_images: params.num_images,
      safety_tolerance: params.safety_tolerance,
      limit_generations: params.limit_generations,
      enable_web_search: params.enable_web_search,
      thinking_level: params.thinking_level
    };
    if (params.system_prompt) payload.system_prompt = params.system_prompt;
    if (typeof params.seed === "number") payload.seed = params.seed;
    return payload;
  },

  mapOutput(raw: unknown): NanoBanana2Output {
    const r = raw as {
      images?: Array<{ url?: string }>;
      description?: string;
    };
    if (!r?.images?.length || !r.images.every(img => Boolean(img?.url))) {
      throw new Error("Nano Banana 2 output missing images[].url");
    }
    return {
      images: r.images as NanoBanana2Output["images"],
      description: r.description
    };
  },

  estimateCostUsd(params: NanoBanana2Runtime): number {
    // Mismo pricing que la variante /edit: $0.04 base @ 1K.
    const BASE_1K = 0.04;
    const multiplier = RESOLUTION_MULTIPLIER[params.resolution];
    const perImage = BASE_1K * multiplier;
    const websearchExtra = params.enable_web_search ? 0.015 : 0;
    const thinkingExtra = params.thinking_level === "high" ? 0.002 : 0;
    const total =
      (perImage + websearchExtra + thinkingExtra) * params.num_images;
    return Number(total.toFixed(3));
  }
};

export default NanoBanana2;
