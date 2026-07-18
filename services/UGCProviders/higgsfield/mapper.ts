/**
 * Mapper Higgsfield ⇄ capa neutral.
 *
 * Alineado al contrato real del SDK oficial:
 *   • mapJobSet:  JobSet → ProviderJob (status agregado + outputs raw/min).
 *   • buildGeneratePayload: GenerationRequest neutro → { endpoint, params }
 *     con el input EXACTO de cada endpoint (soul / dop / speak).
 *   • mapSoulStyle / mapMotion: presets reales → StylePreset del front.
 */

import type {
  StylePreset,
  ProviderJob,
  ProviderJobStatus,
  ProviderJobOutput,
  CharacterRef,
  MediaType
} from "../../Generation/types";
import type {
  HiggsfieldJobSet,
  HiggsfieldSoulStyle,
  HiggsfieldMotion,
  HiggsfieldCustomReference
} from "./types";
import { FALLBACK_STYLE_PREVIEW } from "./catalog";
import { getModelDef, aspectToSoulWH } from "./models";

/* --------------------------- job-set → ProviderJob -------------------- */

function aggregateStatus(jobSet: HiggsfieldJobSet): ProviderJobStatus {
  const statuses = (jobSet.jobs || []).map(j => String(j.status));
  if (statuses.some(s => s === "failed" || s === "canceled" || s === "nsfw")) {
    return "failed";
  }
  if (statuses.length > 0 && statuses.every(s => s === "completed")) {
    return "succeeded";
  }
  if (statuses.some(s => s === "completed")) return "succeeded";
  if (statuses.some(s => s === "in_progress")) return "processing";
  return "queued";
}

export function mapJobSet(jobSet: HiggsfieldJobSet): ProviderJob {
  const status = aggregateStatus(jobSet);
  const outputs: ProviderJobOutput[] = [];

  for (const job of jobSet.jobs || []) {
    const raw = job.results?.raw;
    if (raw?.url) {
      const mediaType: MediaType = raw.type === "video" ? "video" : "image";
      outputs.push({
        url: raw.url,
        mediaType,
        mimeType: mediaType === "video" ? "video/mp4" : "image/png",
        thumbnailUrl: job.results?.min?.url
      });
    }
  }

  const nsfw = (jobSet.jobs || []).some(j => String(j.status) === "nsfw");
  const failed = (jobSet.jobs || []).some(j => String(j.status) === "failed");

  return {
    providerJobId: jobSet.id,
    status,
    outputs: outputs.length ? outputs : undefined,
    error:
      status === "failed"
        ? nsfw
          ? "Contenido rechazado por política (NSFW)"
          : failed
          ? "El proveedor reportó error en la generación"
          : "Generación cancelada"
        : undefined,
    raw: jobSet
  };
}

/* --------------------------- presets reales --------------------------- */

export function mapSoulStyle(style: HiggsfieldSoulStyle): StylePreset {
  return {
    id: style.id,
    label: style.name || style.id,
    category: "Estilo",
    previewUrl: style.preview_url || FALLBACK_STYLE_PREVIEW,
    description: style.description,
    params: { style_id: style.id }
  };
}

export function mapMotion(motion: HiggsfieldMotion): StylePreset {
  return {
    id: motion.id,
    label: motion.name || motion.id,
    category: "Cámara",
    previewUrl: motion.preview_url || FALLBACK_STYLE_PREVIEW,
    description: motion.description,
    // Marca interna: el motion se inyecta como motions:[{id,strength}] en DoP.
    params: { __motionId: motion.id }
  };
}

export function mapCharacter(ref: HiggsfieldCustomReference): CharacterRef {
  return {
    id: ref.id,
    name: ref.name || ref.id,
    previewUrl: ref.preview_url
  };
}

/* --------------------------- build de inputs -------------------------- */

interface NeutralReq {
  modelId: string;
  prompt: string;
  styleId?: string;
  resolution?: string;
  aspectRatio?: string;
  duration?: number;
  audio?: boolean;
  references?: string[];
  characterIds?: string[];
  count?: number;
  params?: Record<string, unknown>;
}

/**
 * Construye el `params` exacto para cualquier modelo del registro, según su
 * familia y campos reales. Genérico → agregar un modelo = solo editar models.ts.
 */
export function buildGeneratePayload(req: NeutralReq): {
  endpoint: string;
  params: Record<string, unknown>;
} {
  const endpoint = req.modelId;
  const def = getModelDef(endpoint);
  const p = (req.params || {}) as Record<string, unknown>;
  const refs = req.references || [];

  if (!def) {
    return { endpoint, params: { prompt: req.prompt, ...p } };
  }

  const out: Record<string, unknown> = { prompt: req.prompt };

  // --- Imagen de referencia / inicio ---
  if (def.imageField === "input_image" && refs[0]) {
    out.input_image = { type: "image_url", image_url: refs[0] };
  } else if (def.imageField === "input_images" && refs.length) {
    out.input_images = refs.map(url => ({ type: "image_url", image_url: url }));
  } else if ((def.imageField as string) === "image_reference" && refs[0]) {
    out.image_reference = { type: "image_url", image_url: refs[0] };
  }

  // --- Variante del modelo ---
  if (def.modelVariants?.length) {
    out.model = (p.model as string) || def.modelVariants[0].value;
  }

  // --- Resolución / calidad (mismo chip "resolution" en la barra) ---
  if (def.resolutions?.length && req.resolution) {
    out.resolution = req.resolution;
  } else if (def.qualities?.length && req.resolution) {
    out.quality = req.resolution;
  }

  // --- Duración ---
  if (def.durations?.length && req.duration != null) {
    out.duration = req.duration;
  }

  // --- Aspect ratio (soul usa width_and_height en su lugar) ---
  if (def.widthHeights?.length) {
    out.width_and_height = aspectToSoulWH(req.aspectRatio, req.resolution);
  } else if (def.aspectRatios?.length && req.aspectRatio) {
    out.aspect_ratio = req.aspectRatio;
  }

  // --- batch_size (soul) ---
  if (def.batchSizes?.length) {
    out.batch_size = req.count && req.count >= 4 ? 4 : 1;
  }

  // --- Estilos dinámicos ---
  if (def.stylesSource === "soul-styles") {
    const sid = (p.style_id as string) || req.styleId;
    if (sid) out.style_id = sid;
    if (typeof p.style_strength === "number") out.style_strength = p.style_strength;
    if (req.characterIds?.[0]) out.custom_reference_id = req.characterIds[0];
  } else if (def.stylesSource === "motions") {
    const strength = typeof p.motion_strength === "number" ? p.motion_strength : 1;
    const ids = Array.isArray(p.__motionIds)
      ? (p.__motionIds as string[])
      : p.__motionId
      ? [p.__motionId as string]
      : [];
    if (ids.length) out.motions = ids.map(id => ({ id, strength }));
  }

  // --- Speak: audio ---
  if (def.requiresAudio) {
    out.input_audio = { type: "audio_url", audio_url: (p.audio_url as string) || "" };
  }

  // --- enhance_prompt + seed (comunes) ---
  out.enhance_prompt = typeof p.enhance_prompt === "boolean" ? p.enhance_prompt : true;
  if (typeof p.seed === "number") out.seed = p.seed;

  return { endpoint, params: out };
}
