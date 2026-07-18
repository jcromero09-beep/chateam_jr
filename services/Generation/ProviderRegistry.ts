/**
 * Registro de proveedores de generación (spec §8 — extensible para sumar
 * fal/Replicate sin tocar el resto).
 *
 * Resuelve un GenerationProvider por su id. El registro es perezoso: el
 * provider se instancia la primera vez que se pide y se cachea, para no crear
 * clients innecesarios al levantar el server.
 */

import type { GenerationProvider } from "./GenerationProvider";
import type { ProviderId } from "./types";
import AppError from "../../errors/AppError";
import { HiggsfieldProvider } from "../UGCProviders/higgsfield/HiggsfieldProvider";

type ProviderFactory = () => GenerationProvider;

const FACTORIES: Partial<Record<ProviderId, ProviderFactory>> = {
  higgsfield: () => new HiggsfieldProvider()
  // fal: () => new FalGenerationProvider()   // se podrá envolver luego
};

const instances = new Map<ProviderId, GenerationProvider>();

/** Lista los ids de proveedor registrados. */
export function listProviderIds(): ProviderId[] {
  return Object.keys(FACTORIES) as ProviderId[];
}

/** Devuelve el provider por id (instancia cacheada). Throw 404 si no existe. */
export function getProvider(id: ProviderId): GenerationProvider {
  const cached = instances.get(id);
  if (cached) return cached;

  const factory = FACTORIES[id];
  if (!factory) {
    throw new AppError(`ERR_GENERATION_PROVIDER_NOT_FOUND: ${id}`, 404);
  }

  const provider = factory();
  instances.set(id, provider);
  return provider;
}

/**
 * Devuelve TODOS los providers registrados (instancias). Útil para el
 * catálogo unificado del model-selector.
 */
export function getAllProviders(): GenerationProvider[] {
  return listProviderIds().map(getProvider);
}

/**
 * Resuelve el provider que expone un modelId dado. Por ahora solo Higgsfield
 * está en el registry, pero el lookup es robusto: pregunta a cada provider si
 * conoce el modelo.
 */
export async function resolveProviderForModel(
  modelId: string,
  companyId?: number | null
): Promise<GenerationProvider> {
  for (const provider of getAllProviders()) {
    try {
      const models = await provider.listModels({ companyId });
      if (models.some(m => m.id === modelId)) {
        return provider;
      }
    } catch {
      // Ignorar provider que falle al listar — probar el siguiente.
    }
  }
  throw new AppError(`ERR_GENERATION_MODEL_NOT_FOUND: ${modelId}`, 404);
}
