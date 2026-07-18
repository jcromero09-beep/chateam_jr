/**
 * Schemas Zod del request body de PATCH /ugc/campaigns/:id/model-selection.
 *
 * Solo valida la FORMA del body (presencia de slots, modelKeys válidas).
 * La validación de categorías cruzadas (pipelineMode × adapter.category)
 * vive en ValidatePipelineSelection.ts porque requiere lookup en el
 * registry de adapters.
 */

import { z } from "zod";
import { FAL_ADAPTER_KEYS } from "../UGCProviders/fal/adapters/registry";

export const PIPELINE_MODES = [
  "image-then-video",
  "text-to-video-direct",
  "lipsync-talking-head"
] as const;

export type PipelineMode = (typeof PIPELINE_MODES)[number];

/**
 * Un slot del pipeline. modelKey debe existir en el registry.
 * defaults es un blob libre que el adapter validará después con su
 * propio defaultSchema.
 */
const slotSchema = z
  .object({
    modelKey: z.enum(
      FAL_ADAPTER_KEYS.length > 0
        ? (FAL_ADAPTER_KEYS as unknown as [string, ...string[]])
        : (["__placeholder__"] as [string, ...string[]])
    ),
    defaults: z.record(z.unknown()).optional().default({})
  })
  .nullable();

export type PipelineSlotInput = z.infer<typeof slotSchema>;

export const pipelineSelectionSchema = z
  .object({
    pipelineMode: z.enum(PIPELINE_MODES),
    slots: z.object({
      image: slotSchema.optional().default(null),
      video: slotSchema, // siempre obligatorio
      voice: slotSchema.optional().default(null),
      lipsync: slotSchema.optional().default(null)
    }),
    videoModelMotionReferenceUrl: z
      .string()
      .url()
      .optional()
      .nullable()
  })
  .superRefine((data, ctx) => {
    const { pipelineMode, slots } = data;

    const issue = (path: (string | number)[], message: string): void =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // video siempre requerido
    if (!slots.video) {
      issue(["slots", "video"], "videoSlot es obligatorio en todos los modos");
    }

    if (pipelineMode === "image-then-video") {
      if (!slots.image) {
        issue(["slots", "image"], "imageSlot requerido para image-then-video");
      }
      if (slots.lipsync) {
        issue(["slots", "lipsync"], "lipsync no aplica en image-then-video");
      }
    }

    if (pipelineMode === "text-to-video-direct") {
      if (slots.image) {
        issue(["slots", "image"], "imageSlot no aplica en text-to-video-direct");
      }
      if (slots.lipsync) {
        issue(["slots", "lipsync"], "lipsync no aplica en text-to-video-direct");
      }
    }

    if (pipelineMode === "lipsync-talking-head") {
      if (!slots.image) issue(["slots", "image"], "imageSlot requerido");
      if (!slots.voice) issue(["slots", "voice"], "voiceSlot requerido");
      if (!slots.lipsync) issue(["slots", "lipsync"], "lipsyncSlot requerido");
    }

    // Regla universal: lipsync sin voice no tiene sentido.
    if (slots.lipsync && !slots.voice) {
      issue(
        ["slots", "lipsync"],
        "lipsync requiere voice (necesita audio para sincronizar)"
      );
    }
  });

export type PipelineSelectionRequest = z.infer<typeof pipelineSelectionSchema>;
