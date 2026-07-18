/**
 * Validador puro (no I/O) de combinaciones pipelineMode × adapter.category.
 *
 * Complementa PipelineSelectionSchemas.ts:
 *   - Zod schema valida la FORMA del body.
 *   - Este módulo valida la SEMÁNTICA cruzada con las categorías de los
 *     adapters resueltos en el registry.
 *
 * No hace I/O. Es testeable como pure function.
 */

import { ZodError } from "zod";
import { findAdapter } from "../UGCProviders/fal/adapters/registry";
import type {
  FalAdapter,
  FalAdapterCategory
} from "../UGCProviders/fal/adapters/types";
import type {
  PipelineMode,
  PipelineSlotInput
} from "./PipelineSelectionSchemas";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface PipelineSelection {
  pipelineMode: PipelineMode;
  slots: {
    image: PipelineSlotInput | null;
    video: PipelineSlotInput | null;
    voice: PipelineSlotInput | null;
    lipsync: PipelineSlotInput | null;
  };
  videoModelMotionReferenceUrl?: string | null;
}

interface SlotMeta {
  slotName: "image" | "video" | "voice" | "lipsync";
  expectedCategories: ReadonlyArray<FalAdapterCategory>;
}

/**
 * Categorías permitidas por (pipelineMode, slot).
 * Las claves vacías significan "ese slot no aplica para ese modo".
 */
const MATRIX: Record<
  PipelineMode,
  ReadonlyArray<SlotMeta>
> = {
  "image-then-video": [
    { slotName: "image", expectedCategories: ["text-to-image"] },
    {
      slotName: "video",
      // image-to-video o motion-control (video-to-video).
      expectedCategories: ["image-to-video", "video-to-video"]
    },
    { slotName: "voice", expectedCategories: ["text-to-speech"] }
    // lipsync no aplica
  ],
  "text-to-video-direct": [
    { slotName: "video", expectedCategories: ["text-to-video"] },
    { slotName: "voice", expectedCategories: ["text-to-speech"] }
    // image y lipsync no aplican
  ],
  "lipsync-talking-head": [
    { slotName: "image", expectedCategories: ["text-to-image"] },
    // motion-control no encaja con lipsync — solo image-to-video puro.
    { slotName: "video", expectedCategories: ["image-to-video"] },
    { slotName: "voice", expectedCategories: ["text-to-speech"] },
    { slotName: "lipsync", expectedCategories: ["lipsync"] }
  ]
};

/**
 * Valida cada slot del payload contra:
 *   1. adapter.category coincide con las expectedCategories del modo
 *   2. defaults del slot pasan adapter.defaultSchema
 *   3. assets requeridos están presentes (motion-control → motionReferenceUrl)
 */
export function validatePipelineSelection(
  selection: PipelineSelection
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const matrix = MATRIX[selection.pipelineMode];
  if (!matrix) {
    issues.push({
      field: "pipelineMode",
      message: `pipelineMode desconocido: ${selection.pipelineMode}`
    });
    return issues;
  }

  for (const slotMeta of matrix) {
    const slot = selection.slots[slotMeta.slotName];
    if (!slot) continue; // optionalidad ya la cubre Zod en el paso previo

    const adapter = findAdapter(slot.modelKey);
    if (!adapter) {
      issues.push({
        field: `slots.${slotMeta.slotName}.modelKey`,
        message: `Adapter '${slot.modelKey}' no existe en el registry`
      });
      continue;
    }

    // Disponibilidad
    if (adapter.available === false) {
      issues.push({
        field: `slots.${slotMeta.slotName}.modelKey`,
        message: `Adapter '${slot.modelKey}' está marcado como no disponible`
      });
      continue;
    }

    // Categoría esperada
    if (!slotMeta.expectedCategories.includes(adapter.category)) {
      issues.push({
        field: `slots.${slotMeta.slotName}.modelKey`,
        message:
          `Adapter '${slot.modelKey}' tiene categoría '${adapter.category}' ` +
          `pero el modo '${selection.pipelineMode}' espera ` +
          `[${slotMeta.expectedCategories.join(", ")}] para slot '${slotMeta.slotName}'`
      });
      continue;
    }

    // Defaults contra schema
    try {
      adapter.defaultSchema.parse(slot.defaults ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        for (const zi of err.issues) {
          issues.push({
            field: `slots.${slotMeta.slotName}.defaults.${zi.path.join(".")}`,
            message: zi.message
          });
        }
      } else {
        issues.push({
          field: `slots.${slotMeta.slotName}.defaults`,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Assets de campaña (motion-control → motion-reference)
    const requires = adapter.requiresCampaignAssets ?? [];
    if (
      requires.includes("motionReferenceVideo") &&
      !selection.videoModelMotionReferenceUrl
    ) {
      issues.push({
        field: "videoModelMotionReferenceUrl",
        message: `Adapter '${slot.modelKey}' requiere motion-reference video para la campaña`
      });
    }
  }

  return issues;
}

/** Type-guard helper: extrae adapter resuelto + defaults para cada slot. */
export interface ResolvedSlot {
  slotName: "image" | "video" | "voice" | "lipsync";
  adapter: FalAdapter<unknown, unknown, unknown>;
  defaults: Record<string, unknown>;
}

export function resolveSlotAdapters(
  selection: PipelineSelection
): ResolvedSlot[] {
  const result: ResolvedSlot[] = [];
  for (const slotName of ["image", "video", "voice", "lipsync"] as const) {
    const slot = selection.slots[slotName];
    if (!slot) continue;
    const adapter = findAdapter(slot.modelKey);
    if (!adapter) continue;
    result.push({
      slotName,
      adapter,
      defaults: slot.defaults ?? {}
    });
  }
  return result;
}
