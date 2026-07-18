/**
 * Catálogo de Higgsfield generado desde el registro REAL de modelos (models.ts).
 * Expresado en el shape NEUTRO (NormalizedModelDetail) para servirse directo.
 *
 * Los estilos (soul-styles) y motions reales los añade HiggsfieldProvider en
 * vivo según `stylesSource`. Aquí solo van capacidades + params.
 */

import type {
  NormalizedModelDetail,
  ParamSpec
} from "../../Generation/types";
import { HF_MODELS, getModelDef, type HFModelDef } from "./models";

// Vacío por defecto: el front muestra un fallback degradado con icono en vez
// de una imagen rota. Se puede setear una URL curada vía env si se desea.
export const FALLBACK_STYLE_PREVIEW = process.env.HIGGSFIELD_FALLBACK_PREVIEW || "";

/** Valores de resolución/calidad que muestra el chip (raw de la API). */
function resolutionValues(def: HFModelDef): string[] {
  if (def.resolutions?.length) return def.resolutions.map(e => e.value);
  if (def.qualities?.length) return def.qualities.map(e => e.value);
  return [];
}

function buildParams(def: HFModelDef): ParamSpec[] {
  const params: ParamSpec[] = [];

  if (def.requiresImage && def.imageField) {
    params.push({
      name: "startImage",
      type: "media",
      label: def.family === "speak" ? "Imagen del personaje" : "Imagen de inicio",
      required: true,
      description: "Súbela con el botón + (la API la usa como input)."
    });
  }

  if (def.modelVariants?.length) {
    params.push({
      name: "model",
      type: "enum",
      label: "Versión",
      required: false,
      default: def.modelVariants[0].value,
      enumValues: def.modelVariants.map(e => ({ value: e.value, label: e.label }))
    });
  }

  const resVals = resolutionValues(def);
  if (resVals.length) {
    params.push({
      name: "resolution",
      type: "enum",
      label: def.qualities?.length ? "Calidad" : "Resolución",
      required: false,
      default: resVals[resVals.length - 1], // por defecto la más alta
      enumValues: (def.resolutions ?? def.qualities ?? []).map(e => ({
        value: e.value,
        label: e.label
      }))
    });
  }

  if (def.durations?.length) {
    params.push({
      name: "duration",
      type: "enum",
      label: "Duración",
      required: false,
      default: def.durations[0],
      enumValues: def.durations.map(d => ({ value: String(d), label: `${d}s` }))
    });
  }

  if (def.aspectRatios?.length) {
    params.push({
      name: "aspectRatio",
      type: "enum",
      label: "Formato",
      required: false,
      default: def.aspectRatios[0],
      enumValues: def.aspectRatios.map(a => ({ value: a, label: a }))
    });
  }

  if (def.batchSizes?.length) {
    params.push({
      name: "count",
      type: "enum",
      label: "Variaciones",
      required: false,
      default: def.batchSizes[0],
      enumValues: def.batchSizes.map(b => ({ value: String(b), label: String(b) }))
    });
  }

  return params;
}

function buildModel(def: HFModelDef): NormalizedModelDetail {
  const resVals = resolutionValues(def);
  return {
    id: def.endpoint,
    provider: "higgsfield",
    name: def.name,
    mediaType: def.mediaType,
    description: def.description,
    badges: def.badges,
    previews: [
      {
        thumbnailUrl: FALLBACK_STYLE_PREVIEW,
        exampleUrl: FALLBACK_STYLE_PREVIEW,
        mediaType: def.mediaType
      }
    ],
    capabilities: {
      resolutions: resVals,
      durations: def.durations,
      aspectRatios: def.aspectRatios,
      supportsAudio: def.requiresAudio,
      supportsStartFrame: Boolean(def.imageField),
      supportsCharacters: def.stylesSource === "soul-styles",
      maxCount: def.batchSizes?.length ? Math.max(...def.batchSizes) : 1
    },
    styles: [],
    pricingLabel: def.pricingLabel,
    params: buildParams(def)
  };
}

export function getCatalogModels(): NormalizedModelDetail[] {
  return HF_MODELS.map(buildModel);
}

export function getCatalogModel(id: string): NormalizedModelDetail | null {
  const def = getModelDef(id);
  return def ? buildModel(def) : null;
}

/** Estimación de costo USD por catálogo (no hay endpoint de costo). */
export function estimateCatalogCostUsd(opts: {
  modelId: string;
  duration?: number;
  count?: number;
}): number {
  const def = getModelDef(opts.modelId);
  if (!def) return 0.1;
  if (def.mediaType === "image") {
    const count = opts.count && opts.count >= 4 ? 4 : 1;
    return Number((0.04 * count).toFixed(4));
  }
  // video: aproximación por segundo
  const seconds = opts.duration && opts.duration > 0 ? opts.duration : 5;
  return Number((0.05 * seconds).toFixed(4));
}
