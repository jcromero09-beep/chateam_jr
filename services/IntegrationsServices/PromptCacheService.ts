/**
 * 🚀 PromptCacheService
 *
 * Servicio de caché Redis para prompts y queues de IA.
 * Optimiza el rendimiento evitando queries repetitivas a la base de datos.
 *
 * Estrategia de caché:
 * - TTL de 5 minutos para datos de prompt/queue (datos que cambian poco)
 * - Invalidación automática cuando se actualizan prompts o queues
 * - Fallback a base de datos si Redis no está disponible
 */

import cache from "../../libs/cache.js";
import Queue from "../../models/Queue.js";
import Prompt from "../../models/Prompt.js";
import PromptQueue from "../../models/PromptQueue.js";

// Prefijos de keys en Redis
const CACHE_PREFIX = {
  QUEUE_PROMPT_AI: "ia:queue:promptai",      // promptAI de una queue específica
  PROMPT_QUEUES: "ia:prompt:queues",          // queues asociadas a un prompt
  PROMPT_BY_APIKEY: "ia:prompt:byapikey",     // prompt por apiKey y companyId
};

// TTL en segundos (5 minutos)
const CACHE_TTL = 300;

// Interface para queue cacheada
interface CachedQueue {
  id: number;
  name: string;
  promptAI: string | null;
}

// Interface para prompt cacheado
interface CachedPrompt {
  id: number;
  name: string;
  apiKey: string;
}

/**
 * Obtiene el promptAI de una queue desde caché o DB
 */
export const getCachedQueuePromptAI = async (
  queueId: number,
  companyId: number
): Promise<string | null> => {
  if (!queueId) return null;

  const cacheKey = `${CACHE_PREFIX.QUEUE_PROMPT_AI}:${companyId}:${queueId}`;

  try {
    // 1. Intentar obtener de caché
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      // Si está en caché (incluso si es string vacío), retornarlo
      console.log(`🔴 [REDIS-CACHE] HIT queuePromptAI queueId:${queueId}`);
      return cached === "" ? null : cached;
    }

    console.log(`🔵 [REDIS-CACHE] MISS queuePromptAI queueId:${queueId} - Consultando DB...`);

    // 2. Si no está en caché, obtener de DB
    const queue = await Queue.findOne({
      where: { id: queueId, companyId },
      attributes: ["id", "name", "promptAI"]
    });

    const promptAI = queue?.promptAI || "";

    // 3. Guardar en caché (incluso si es vacío, para evitar queries repetitivas)
    await cache.set(cacheKey, promptAI, "EX", CACHE_TTL);
    console.log(`🔵 [REDIS-CACHE] SET queuePromptAI queueId:${queueId} TTL:${CACHE_TTL}s`);

    return promptAI === "" ? null : promptAI;
  } catch (error) {
    console.error("Error en getCachedQueuePromptAI:", error);
    // Fallback: query directo a DB
    try {
      const queue = await Queue.findOne({
        where: { id: queueId, companyId },
        attributes: ["promptAI"]
      });
      return queue?.promptAI || null;
    } catch {
      return null;
    }
  }
};

/**
 * Obtiene las queues asociadas a un prompt desde caché o DB
 */
export const getCachedPromptQueues = async (
  promptId: number,
  companyId: number
): Promise<CachedQueue[]> => {
  const cacheKey = `${CACHE_PREFIX.PROMPT_QUEUES}:${companyId}:${promptId}`;

  try {
    // 1. Intentar obtener de caché
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      console.log(`🔴 [REDIS-CACHE] HIT promptQueues promptId:${promptId} queues:${parsed.length}`);
      return parsed;
    }

    console.log(`🔵 [REDIS-CACHE] MISS promptQueues promptId:${promptId} - Consultando DB...`);

    // 2. Si no está en caché, obtener de DB
    const promptQueues = await PromptQueue.findAll({
      where: { promptId },
      include: [{
        model: Queue,
        as: "queue",
        where: { companyId },
        attributes: ["id", "name", "promptAI"],
        required: true
      }]
    });

    const queues: CachedQueue[] = promptQueues
      .filter(pq => pq.queue)
      .map(pq => ({
        id: pq.queue.id,
        name: pq.queue.name,
        promptAI: pq.queue.promptAI || null
      }));

    // 3. Guardar en caché
    await cache.set(cacheKey, JSON.stringify(queues), "EX", CACHE_TTL);
    console.log(`🔵 [REDIS-CACHE] SET promptQueues promptId:${promptId} queues:${queues.length} TTL:${CACHE_TTL}s`);

    return queues;
  } catch (error) {
    console.error("Error en getCachedPromptQueues:", error);
    // Fallback: query directo a DB
    try {
      const promptQueues = await PromptQueue.findAll({
        where: { promptId },
        include: [{
          model: Queue,
          as: "queue",
          where: { companyId },
          attributes: ["id", "name", "promptAI"],
          required: true
        }]
      });

      return promptQueues
        .filter(pq => pq.queue)
        .map(pq => ({
          id: pq.queue.id,
          name: pq.queue.name,
          promptAI: pq.queue.promptAI || null
        }));
    } catch {
      return [];
    }
  }
};

/**
 * Obtiene el ID del prompt por apiKey y companyId desde caché o DB
 */
export const getCachedPromptIdByApiKey = async (
  apiKey: string,
  companyId: number
): Promise<number | null> => {
  const cacheKey = `${CACHE_PREFIX.PROMPT_BY_APIKEY}:${companyId}:${apiKey.substring(0, 20)}`;

  try {
    // 1. Intentar obtener de caché
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      const result = cached === "null" ? null : parseInt(cached, 10);
      console.log(`🔴 [REDIS-CACHE] HIT promptIdByApiKey companyId:${companyId} promptId:${result}`);
      return result;
    }

    console.log(`🔵 [REDIS-CACHE] MISS promptIdByApiKey companyId:${companyId} - Consultando DB...`);

    // 2. Si no está en caché, obtener de DB
    const prompt = await Prompt.findOne({
      where: { apiKey, companyId },
      attributes: ["id"]
    });

    const promptId = prompt?.id || null;

    // 3. Guardar en caché
    await cache.set(cacheKey, promptId?.toString() || "null", "EX", CACHE_TTL);
    console.log(`🔵 [REDIS-CACHE] SET promptIdByApiKey companyId:${companyId} promptId:${promptId} TTL:${CACHE_TTL}s`);

    return promptId;
  } catch (error) {
    console.error("Error en getCachedPromptIdByApiKey:", error);
    // Fallback: query directo a DB
    try {
      const prompt = await Prompt.findOne({
        where: { apiKey, companyId },
        attributes: ["id"]
      });
      return prompt?.id || null;
    } catch {
      return null;
    }
  }
};

/**
 * Invalida la caché de una queue específica
 * Llamar cuando se actualiza una queue
 */
export const invalidateQueueCache = async (
  queueId: number,
  companyId: number
): Promise<void> => {
  try {
    const cacheKey = `${CACHE_PREFIX.QUEUE_PROMPT_AI}:${companyId}:${queueId}`;
    await cache.del(cacheKey);

    // También invalidar todas las cachés de prompts que podrían incluir esta queue
    await cache.delFromPattern(`${CACHE_PREFIX.PROMPT_QUEUES}:${companyId}:*`);

    console.log(`🗑️ [CACHE] Invalidada caché de queue ${queueId} para company ${companyId}`);
  } catch (error) {
    console.error("Error invalidando caché de queue:", error);
  }
};

/**
 * Invalida la caché de un prompt específico
 * Llamar cuando se actualiza un prompt o sus queues asociadas
 */
export const invalidatePromptCache = async (
  promptId: number,
  companyId: number
): Promise<void> => {
  try {
    const cacheKey = `${CACHE_PREFIX.PROMPT_QUEUES}:${companyId}:${promptId}`;
    await cache.del(cacheKey);

    // También invalidar caché por apiKey
    await cache.delFromPattern(`${CACHE_PREFIX.PROMPT_BY_APIKEY}:${companyId}:*`);

    console.log(`🗑️ [CACHE] Invalidada caché de prompt ${promptId} para company ${companyId}`);
  } catch (error) {
    console.error("Error invalidando caché de prompt:", error);
  }
};

/**
 * Invalida toda la caché de IA para una company
 * Usar con precaución, solo cuando sea necesario
 */
export const invalidateAllIACacheForCompany = async (
  companyId: number
): Promise<void> => {
  try {
    await cache.delFromPattern(`${CACHE_PREFIX.QUEUE_PROMPT_AI}:${companyId}:*`);
    await cache.delFromPattern(`${CACHE_PREFIX.PROMPT_QUEUES}:${companyId}:*`);
    await cache.delFromPattern(`${CACHE_PREFIX.PROMPT_BY_APIKEY}:${companyId}:*`);

    console.log(`🗑️ [CACHE] Invalidada toda la caché de IA para company ${companyId}`);
  } catch (error) {
    console.error("Error invalidando toda la caché de IA:", error);
  }
};

/**
 * Precarga la caché de queues para un prompt (útil al iniciar)
 */
export const preloadPromptQueuesCache = async (
  promptId: number,
  companyId: number
): Promise<void> => {
  try {
    const queues = await getCachedPromptQueues(promptId, companyId);

    // Precargar también el promptAI de cada queue
    await Promise.all(
      queues.map(q => getCachedQueuePromptAI(q.id, companyId))
    );

    console.log(`📦 [CACHE] Precargada caché para prompt ${promptId} con ${queues.length} queues`);
  } catch (error) {
    console.error("Error precargando caché:", error);
  }
};

export default {
  getCachedQueuePromptAI,
  getCachedPromptQueues,
  getCachedPromptIdByApiKey,
  invalidateQueueCache,
  invalidatePromptCache,
  invalidateAllIACacheForCompany,
  preloadPromptQueuesCache
};
