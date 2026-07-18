/**
 * Registry de adapters fal.ai.
 *
 * Punto único donde se enumeran todos los adapters disponibles para el
 * pipeline UGC. El job, el controller y los tests siempre van por aquí
 * — nunca instancian un adapter directamente.
 *
 * Para agregar un modelo nuevo, ver ./README.md (5 pasos).
 */

import type { FalAdapter, FalAdapterCategory } from "./types";
// --- PR #1 ---
import { Seedance1ProI2V } from "./Seedance1ProI2V";
import { KlingV3ProI2V } from "./KlingV3ProI2V";
import { KlingV3ProMotionControl } from "./KlingV3ProMotionControl";
import { KlingV26ProI2V } from "./KlingV26ProI2V";
import { Veo31ImageToVideo } from "./Veo31ImageToVideo";
import { NanoBanana2Edit } from "./NanoBanana2Edit";
// --- PR #2 ---
import { NanoBanana2 } from "./NanoBanana2";
import { Veo31TextToVideo } from "./Veo31TextToVideo";
import { KlingV3ProTextToVideo } from "./KlingV3ProTextToVideo";
import { KlingV26ProTextToVideo } from "./KlingV26ProTextToVideo";
import { Veo31FastImageToVideo } from "./Veo31FastImageToVideo";
import { ElevenLabsTTSv3 } from "./ElevenLabsTTSv3";
import { F5TTS } from "./F5TTS";
import { SyncLipsync } from "./SyncLipsync";
import { LatentSync } from "./LatentSync";

type AnyAdapter = FalAdapter<unknown, unknown, unknown>;

/** Registro indexado por `adapter.key`. */
export const FAL_ADAPTERS: Readonly<Record<string, AnyAdapter>> = Object.freeze(
  {
    // PR #1
    [Seedance1ProI2V.key]: Seedance1ProI2V as AnyAdapter,
    [KlingV3ProI2V.key]: KlingV3ProI2V as AnyAdapter,
    [KlingV3ProMotionControl.key]: KlingV3ProMotionControl as AnyAdapter,
    [KlingV26ProI2V.key]: KlingV26ProI2V as AnyAdapter,
    [Veo31ImageToVideo.key]: Veo31ImageToVideo as AnyAdapter,
    [NanoBanana2Edit.key]: NanoBanana2Edit as AnyAdapter,
    // PR #2
    [NanoBanana2.key]: NanoBanana2 as AnyAdapter,
    [Veo31TextToVideo.key]: Veo31TextToVideo as AnyAdapter,
    [KlingV3ProTextToVideo.key]: KlingV3ProTextToVideo as AnyAdapter,
    [KlingV26ProTextToVideo.key]: KlingV26ProTextToVideo as AnyAdapter,
    [Veo31FastImageToVideo.key]: Veo31FastImageToVideo as AnyAdapter,
    [ElevenLabsTTSv3.key]: ElevenLabsTTSv3 as AnyAdapter,
    [F5TTS.key]: F5TTS as AnyAdapter,
    [SyncLipsync.key]: SyncLipsync as AnyAdapter,
    [LatentSync.key]: LatentSync as AnyAdapter
  }
);

/**
 * Lookup de adapter por key. Lanza error explícito si no existe — el
 * pipeline JAMÁS debe caer en defaults silenciosos.
 */
export function getAdapter(key: string | null | undefined): AnyAdapter {
  if (!key) {
    throw new Error(
      "[fal/adapters/registry] adapter key vacío — campaña sin modelo seleccionado"
    );
  }
  const adapter = FAL_ADAPTERS[key];
  if (!adapter) {
    throw new Error(
      `[fal/adapters/registry] adapter no encontrado para key='${key}'. ` +
        `Keys conocidas: ${Object.keys(FAL_ADAPTERS).join(", ")}`
    );
  }
  return adapter;
}

/** Variante segura — devuelve null si no existe. */
export function findAdapter(
  key: string | null | undefined
): AnyAdapter | null {
  if (!key) return null;
  return FAL_ADAPTERS[key] ?? null;
}

/** Lista de keys conocidas (orden estable). */
export const FAL_ADAPTER_KEYS: ReadonlyArray<string> = Object.freeze(
  Object.keys(FAL_ADAPTERS)
);

/** Filtra adapters por categoría — usado por el wizard del pipeline. */
export function getAdaptersByCategory(
  category: FalAdapterCategory
): ReadonlyArray<AnyAdapter> {
  return Object.values(FAL_ADAPTERS).filter(a => a.category === category);
}

/** Filtra adapters disponibles (available !== false). */
export function getAvailableAdapters(): ReadonlyArray<AnyAdapter> {
  return Object.values(FAL_ADAPTERS).filter(a => a.available !== false);
}
