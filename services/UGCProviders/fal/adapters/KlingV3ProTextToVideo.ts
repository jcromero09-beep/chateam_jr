/**
 * Adapter: Kling 3.0 Pro · Text-to-Video
 * fal.ai model: fal-ai/kling-video/v3/pro/text-to-video
 *
 * Versión T2V del Kling V3 Pro (PR #1 tenía solo I2V). Soporta
 * multi_prompt opcional para storytelling multi-shot.
 */

import { z } from "zod";
import type { FalAdapter } from "./types";

const DURATION_OPTIONS = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15"
] as const;

const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "1:1"] as const;
const SHOT_TYPE_OPTIONS = ["customize", "intelligent"] as const;

const multiPromptElement = z.object({
  prompt: z.string().min(1).max(800),
  start_time: z.number().nonnegative().optional(),
  end_time: z.number().positive().optional()
});

const defaultSchema = z.object({
  duration: z.enum(DURATION_OPTIONS).default("5"),
  aspect_ratio: z.enum(ASPECT_RATIO_OPTIONS).default("16:9"),
  generate_audio: z.boolean().default(true),
  cfg_scale: z.number().min(0).max(1).default(0.5),
  negative_prompt: z.string().default("blur, distort, and low quality"),
  shot_type: z.enum(SHOT_TYPE_OPTIONS).default("customize")
});

const runtimeSchema = defaultSchema
  .extend({
    prompt: z.string().min(1).max(800).optional(),
    multi_prompt: z.array(multiPromptElement).min(1).max(8).optional()
  })
  .superRefine((data, ctx) => {
    if (data.prompt && data.multi_prompt?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["multi_prompt"],
        message: "prompt y multi_prompt son mutuamente exclusivos"
      });
    }
    if (!data.prompt && !data.multi_prompt?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Debes proveer prompt o multi_prompt"
      });
    }
  });

export type KlingV3ProT2VDefaults = z.infer<typeof defaultSchema>;
export type KlingV3ProT2VRuntime = z.infer<typeof runtimeSchema>;

export interface KlingV3ProT2VOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export const KlingV3ProTextToVideo: FalAdapter<
  KlingV3ProT2VDefaults,
  KlingV3ProT2VRuntime,
  KlingV3ProT2VOutput
> = {
  key: "kling-v3-pro-t2v",
  modelId:
    process.env.FAL_MODEL_KLING_V3_PRO_T2V ??
    "fal-ai/kling-video/v3/pro/text-to-video",
  type: "text-to-video",
  category: "text-to-video",
  inputs: ["text"],
  outputs: ["video", "audio"],
  available: true,

  defaultSchema,
  runtimeSchema,

  mapInput(params: KlingV3ProT2VRuntime): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      duration: params.duration,
      aspect_ratio: params.aspect_ratio,
      generate_audio: params.generate_audio,
      cfg_scale: params.cfg_scale,
      negative_prompt: params.negative_prompt,
      shot_type: params.shot_type
    };
    if (params.prompt) payload.prompt = params.prompt;
    if (params.multi_prompt?.length) payload.multi_prompt = params.multi_prompt;
    return payload;
  },

  mapOutput(raw: unknown): KlingV3ProT2VOutput {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) {
      throw new Error("Kling V3 Pro T2V output missing video.url");
    }
    return { video: r.video as KlingV3ProT2VOutput["video"] };
  },

  estimateCostUsd(params: KlingV3ProT2VRuntime): number {
    const seconds = Number(params.duration ?? "5");
    const RATE = 0.08; // ~$0.08/s
    return Number((seconds * RATE).toFixed(2));
  }
};

export default KlingV3ProTextToVideo;
