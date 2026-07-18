/**
 * Adapter: Nano Banana 2 Edit (Google — Gemini 3.1 Flash Image)
 * fal.ai model: fal-ai/nano-banana-2/edit
 *
 * Único modelo de tipo `image-edit` de esta primera entrega. ATENCIÓN:
 * el input es `image_urls` (LISTA), no `image_url` singular.
 *
 * Pricing escalable por resolution:
 *   0.5K → 0.75x   |   1K → 1x ($0.04)   |   2K → 1.5x   |   4K → 2x
 *   enable_web_search → +$0.015
 *   thinking_level === "high" → +$0.002
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
  image_urls: z.array(z.string().url()).min(1).max(8),
  system_prompt: z.string().max(2000).optional()
});

export type NanoBanana2EditDefaults = z.infer<typeof defaultSchema>;
export type NanoBanana2EditRuntime = z.infer<typeof runtimeSchema>;

export interface NanoBanana2EditOutput {
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

export const NanoBanana2Edit: FalAdapter<
  NanoBanana2EditDefaults,
  NanoBanana2EditRuntime,
  NanoBanana2EditOutput
> = {
  key: "nano-banana-2-edit",
  modelId:
    process.env.FAL_MODEL_NANO_BANANA_2_EDIT ?? "fal-ai/nano-banana-2/edit",
  type: "image-edit",
  category: "image-to-image",
  inputs: ["text", "image"],
  outputs: ["image"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: NanoBanana2EditRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      image_urls: params.image_urls,
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

  mapOutput(raw: unknown): NanoBanana2EditOutput {
    const r = raw as {
      images?: Array<{ url?: string }>;
      description?: string;
    };
    if (!r?.images?.length || !r.images.every(img => Boolean(img?.url))) {
      throw new Error("Nano Banana 2 Edit output missing images[].url");
    }
    return {
      images: r.images as NanoBanana2EditOutput["images"],
      description: r.description
    };
  },

  estimateCostUsd(params: NanoBanana2EditRuntime): number {
    const BASE_1K = 0.04;
    const multiplier = RESOLUTION_MULTIPLIER[params.resolution];
    const perImage = BASE_1K * multiplier;
    const websearchExtra = params.enable_web_search ? 0.015 : 0;
    const thinkingExtra = params.thinking_level === "high" ? 0.002 : 0;
    const total =
      (perImage + websearchExtra + thinkingExtra) * params.num_images;
    return Number(total.toFixed(3));
  },

  requiresCampaignAssets: ["characterImage"]
};

export default NanoBanana2Edit;
