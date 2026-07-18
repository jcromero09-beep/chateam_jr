/**
 * Service: UpdateModelSelectionService
 *
 * Persiste la selección de pipeline (4 slots + pipelineMode) en una
 * UGCCampaign. Soporta DOS shapes de input:
 *
 *  - PR #1 (legacy flat):
 *      { videoModelKey, videoModelDefaults, videoModelMotionReferenceUrl,
 *        imageModelKey, imageModelDefaults }
 *    Sin slots de voz/lipsync; pipelineMode se deduce como
 *    'image-then-video' (default).
 *
 *  - PR #2 (pipeline-builder):
 *      { pipelineMode, slots: { image, video, voice, lipsync },
 *        videoModelMotionReferenceUrl? }
 *
 * El controller detecta el shape por la presencia de `slots` y llama al
 * camino correcto. Ambos terminan en el mismo persistence path.
 */

import { ZodError } from "zod";
import UGCCampaign from "../../models/UGCCampaign";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import {
  findAdapter,
  FAL_ADAPTER_KEYS
} from "../UGCProviders/fal/adapters/registry";
import type { FalAdapter } from "../UGCProviders/fal/adapters/types";
import {
  pipelineSelectionSchema,
  type PipelineMode,
  type PipelineSelectionRequest
} from "./PipelineSelectionSchemas";
import { validatePipelineSelection } from "./ValidatePipelineSelection";

export interface ValidationIssue {
  field: string;
  message: string;
}

class ValidationAppError extends AppError {
  public readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super("Validación de model-selection falló", 422);
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export interface UpdateModelSelectionLegacyRequest {
  campaignId: number;
  companyId: number;
  userId: number;
  videoModelKey?: string | null;
  videoModelDefaults?: Record<string, unknown> | null;
  videoModelMotionReferenceUrl?: string | null;
  imageModelKey?: string | null;
  imageModelDefaults?: Record<string, unknown> | null;
}

export interface UpdateModelSelectionPipelineRequest {
  campaignId: number;
  companyId: number;
  userId: number;
  body: unknown; // se valida con pipelineSelectionSchema
}

// ---------------------------------------------------------------------------
// Helpers legacy (PR #1)
// ---------------------------------------------------------------------------

function validateLegacyAdapterSelection(opts: {
  adapter: FalAdapter<unknown, unknown, unknown>;
  defaults: Record<string, unknown> | null | undefined;
  motionReferenceUrl: string | null | undefined;
  scope: "video" | "image";
  issues: ValidationIssue[];
}): void {
  const { adapter, defaults, motionReferenceUrl, scope, issues } = opts;

  try {
    adapter.defaultSchema.parse(defaults || {});
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues) {
        issues.push({
          field: `${scope}ModelDefaults.${issue.path.join(".")}`,
          message: issue.message
        });
      }
    } else {
      issues.push({
        field: `${scope}ModelDefaults`,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const requires = adapter.requiresCampaignAssets ?? [];
  if (requires.includes("motionReferenceVideo") && !motionReferenceUrl) {
    issues.push({
      field: "videoModelMotionReferenceUrl",
      message: "Este modelo requiere un video de motion-reference para la campaña"
    });
  }
}

// ---------------------------------------------------------------------------
// Implementación legacy (PR #1)
// ---------------------------------------------------------------------------

async function updateLegacy(
  req: UpdateModelSelectionLegacyRequest,
  campaign: UGCCampaign
): Promise<UGCCampaign> {
  const issues: ValidationIssue[] = [];

  let videoAdapter: FalAdapter<unknown, unknown, unknown> | null = null;
  if (req.videoModelKey !== undefined && req.videoModelKey !== null) {
    videoAdapter = findAdapter(req.videoModelKey);
    if (!videoAdapter) {
      issues.push({
        field: "videoModelKey",
        message:
          `Adapter '${req.videoModelKey}' no existe. ` +
          `Keys válidas: ${FAL_ADAPTER_KEYS.join(", ")}`
      });
    } else {
      const motionReference =
        req.videoModelMotionReferenceUrl !== undefined
          ? req.videoModelMotionReferenceUrl
          : campaign.videoModelMotionReferenceUrl ?? null;
      validateLegacyAdapterSelection({
        adapter: videoAdapter,
        defaults: req.videoModelDefaults,
        motionReferenceUrl: motionReference,
        scope: "video",
        issues
      });
    }
  }

  let imageAdapter: FalAdapter<unknown, unknown, unknown> | null = null;
  if (req.imageModelKey !== undefined && req.imageModelKey !== null) {
    imageAdapter = findAdapter(req.imageModelKey);
    if (!imageAdapter) {
      issues.push({
        field: "imageModelKey",
        message:
          `Adapter '${req.imageModelKey}' no existe. ` +
          `Keys válidas: ${FAL_ADAPTER_KEYS.join(", ")}`
      });
    } else {
      validateLegacyAdapterSelection({
        adapter: imageAdapter,
        defaults: req.imageModelDefaults,
        motionReferenceUrl: null,
        scope: "image",
        issues
      });
    }
  }

  if (issues.length > 0) {
    throw new ValidationAppError(issues);
  }

  const updates: Partial<UGCCampaign> = {};
  if (videoAdapter) {
    updates.videoModelKey = videoAdapter.key;
    updates.videoModelId = videoAdapter.modelId;
    if (req.videoModelDefaults !== undefined) {
      updates.videoModelDefaults = req.videoModelDefaults ?? {};
    }
  }
  if (req.videoModelMotionReferenceUrl !== undefined) {
    updates.videoModelMotionReferenceUrl = req.videoModelMotionReferenceUrl;
  }
  if (imageAdapter) {
    updates.imageModelKey = imageAdapter.key;
    updates.imageModelId = imageAdapter.modelId;
    if (req.imageModelDefaults !== undefined) {
      updates.imageModelDefaults = req.imageModelDefaults ?? {};
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.modelSelectedAt = new Date();
    updates.modelSelectedBy = req.userId;
    await campaign.update(updates);
  }
  await campaign.reload();
  return campaign;
}

// ---------------------------------------------------------------------------
// Implementación pipeline (PR #2)
// ---------------------------------------------------------------------------

async function updatePipeline(
  req: UpdateModelSelectionPipelineRequest,
  campaign: UGCCampaign
): Promise<UGCCampaign> {
  // 1) Zod: forma del body
  let parsed: PipelineSelectionRequest;
  try {
    parsed = pipelineSelectionSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map(zi => ({
        field: zi.path.join("."),
        message: zi.message
      }));
      throw new ValidationAppError(issues);
    }
    throw err;
  }

  // 2) Semántica cruzada (pipelineMode × adapter.category)
  const semIssues = validatePipelineSelection({
    pipelineMode: parsed.pipelineMode,
    slots: {
      image: parsed.slots.image ?? null,
      video: parsed.slots.video ?? null,
      voice: parsed.slots.voice ?? null,
      lipsync: parsed.slots.lipsync ?? null
    },
    videoModelMotionReferenceUrl:
      parsed.videoModelMotionReferenceUrl !== undefined
        ? parsed.videoModelMotionReferenceUrl
        : campaign.videoModelMotionReferenceUrl ?? null
  });

  if (semIssues.length > 0) {
    throw new ValidationAppError(semIssues);
  }

  // 3) Persistir
  const updates: Partial<UGCCampaign> = {
    pipelineMode: parsed.pipelineMode as PipelineMode
  };

  // Image slot
  if (parsed.slots.image) {
    const a = findAdapter(parsed.slots.image.modelKey);
    if (a) {
      updates.imageModelKey = a.key;
      updates.imageModelId = a.modelId;
      updates.imageModelDefaults = parsed.slots.image.defaults ?? {};
    }
  } else {
    // Modo text-to-video-direct: limpiar slot de imagen
    updates.imageModelKey = null;
    updates.imageModelId = null;
    updates.imageModelDefaults = {};
  }

  // Video slot (siempre presente por Zod)
  if (parsed.slots.video) {
    const a = findAdapter(parsed.slots.video.modelKey);
    if (a) {
      updates.videoModelKey = a.key;
      updates.videoModelId = a.modelId;
      updates.videoModelDefaults = parsed.slots.video.defaults ?? {};
    }
  }

  // Voice slot
  if (parsed.slots.voice) {
    const a = findAdapter(parsed.slots.voice.modelKey);
    if (a) {
      updates.voiceModelKey = a.key;
      updates.voiceModelDefaults = parsed.slots.voice.defaults ?? {};
    }
  } else {
    updates.voiceModelKey = null;
    updates.voiceModelDefaults = {};
  }

  // Lipsync slot
  if (parsed.slots.lipsync) {
    const a = findAdapter(parsed.slots.lipsync.modelKey);
    if (a) {
      updates.lipsyncModelKey = a.key;
      updates.lipsyncModelDefaults = parsed.slots.lipsync.defaults ?? {};
    }
  } else {
    updates.lipsyncModelKey = null;
    updates.lipsyncModelDefaults = {};
  }

  if (parsed.videoModelMotionReferenceUrl !== undefined) {
    updates.videoModelMotionReferenceUrl = parsed.videoModelMotionReferenceUrl;
  }

  updates.modelSelectedAt = new Date();
  updates.modelSelectedBy = req.userId;

  await campaign.update(updates);
  logger.info(
    `[UpdateModelSelection] campaign=${req.campaignId} pipelineMode=${parsed.pipelineMode} ` +
      `image=${updates.imageModelKey ?? "-"} video=${updates.videoModelKey ?? "-"} ` +
      `voice=${updates.voiceModelKey ?? "-"} lipsync=${updates.lipsyncModelKey ?? "-"}`
  );

  await campaign.reload();
  return campaign;
}

// ---------------------------------------------------------------------------
// Punto de entrada — dispatch por shape
// ---------------------------------------------------------------------------

function isPipelineShape(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "slots" in (body as Record<string, unknown>)
  );
}

export interface UpdateModelSelectionEntryRequest {
  campaignId: number;
  companyId: number;
  userId: number;
  body: unknown;
}

const UpdateModelSelectionService = async (
  req: UpdateModelSelectionEntryRequest
): Promise<UGCCampaign> => {
  const campaign = await UGCCampaign.findOne({
    where: { id: req.campaignId, companyId: req.companyId }
  });
  if (!campaign) {
    throw new AppError("Campaña UGC no encontrada", 404);
  }

  if (isPipelineShape(req.body)) {
    return updatePipeline(
      {
        campaignId: req.campaignId,
        companyId: req.companyId,
        userId: req.userId,
        body: req.body
      },
      campaign
    );
  }

  // Fallback legacy (PR #1)
  const legacy = (req.body ?? {}) as Record<string, unknown>;
  return updateLegacy(
    {
      campaignId: req.campaignId,
      companyId: req.companyId,
      userId: req.userId,
      videoModelKey: legacy.videoModelKey as string | null | undefined,
      videoModelDefaults: legacy.videoModelDefaults as
        | Record<string, unknown>
        | null
        | undefined,
      videoModelMotionReferenceUrl: legacy.videoModelMotionReferenceUrl as
        | string
        | null
        | undefined,
      imageModelKey: legacy.imageModelKey as string | null | undefined,
      imageModelDefaults: legacy.imageModelDefaults as
        | Record<string, unknown>
        | null
        | undefined
    },
    campaign
  );
};

export { ValidationAppError };
export default UpdateModelSelectionService;
