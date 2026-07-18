/**
 * DistributedLock — FASE 2 Coexistencia WhatsApp.
 *
 * Mutex distribuido basado en Redis SET NX PX (single-instance variant
 * del patrón Redlock). Suficiente para coordinar handlers de webhook
 * Meta entre los dos nodos PM2 (node-1, node-2).
 *
 * Uso típico:
 *   const lock = await acquireLock(`meta:inbound:${companyId}:${phoneNumberId}:${wa_id}`, 5000);
 *   if (!lock.acquired) return; // otro worker tiene el lock — skip
 *   try { ... } finally { await releaseLock(lock); }
 *
 * Garantías:
 *   - Atomicidad del set NX
 *   - Auto-release por TTL si el worker crashea
 *   - Liberación segura vía token (sólo el dueño libera)
 *
 * Limitaciones:
 *   - No implementa quorum multi-master (Redlock completo).
 *     Nuestro Redis es single-instance en producción — suficiente.
 *   - TTL debe ser > tiempo máximo de procesamiento del handler;
 *     default 10s.
 */
import { randomUUID } from "crypto";
import cacheLayer from "../../libs/cache";
import logger from "../../utils/logger";

export interface Lock {
  key: string;
  token: string;
  acquired: boolean;
  acquiredAt?: number;
  ttlMs?: number;
}

const LUA_RELEASE = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Intenta adquirir el lock. Si falla por tope de reintentos, devuelve acquired=false.
 * @param key clave del lock (namespace sugerido: 'coex:lock:...')
 * @param ttlMs tiempo de vida del lock en ms (default 10000)
 * @param retries reintentos antes de rendirse (default 3)
 * @param retryDelayMs delay entre reintentos en ms (default 50)
 */
export const acquireLock = async (
  key: string,
  ttlMs: number = 10000,
  retries: number = 3,
  retryDelayMs: number = 50
): Promise<Lock> => {
  const token = randomUUID();
  const redis = cacheLayer.getRedisInstance();
  let attempt = 0;
  while (attempt <= retries) {
    try {
      // @ts-ignore — ioredis set variadic args
      const result = await redis.set(key, token, "PX", ttlMs, "NX");
      if (result === "OK") {
        return { key, token, acquired: true, acquiredAt: Date.now(), ttlMs };
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, key },
        "[DistributedLock] error acquiring lock"
      );
      return { key, token, acquired: false };
    }
    attempt += 1;
    if (attempt > retries) break;
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return { key, token, acquired: false };
};

/**
 * Libera el lock SÓLO si el token coincide con el dueño.
 * Seguro contra release de lock que ya expiró y fue re-adquirido
 * por otro worker (evita free-after-use bug clásico).
 */
export const releaseLock = async (lock: Lock): Promise<boolean> => {
  if (!lock || !lock.acquired) return false;
  const redis = cacheLayer.getRedisInstance();
  try {
    const result = await redis.eval(LUA_RELEASE, 1, lock.key, lock.token);
    return result === 1;
  } catch (err: any) {
    logger.warn(
      { err: err?.message, key: lock.key },
      "[DistributedLock] error releasing lock"
    );
    return false;
  }
};

/**
 * Helper: ejecutar fn dentro de un lock. Si no se puede adquirir, devuelve
 * null y NO ejecuta fn. El caller debe manejar el caso null.
 */
export const withLock = async <T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<{ acquired: boolean; result?: T }> => {
  const lock = await acquireLock(key, ttlMs);
  if (!lock.acquired) return { acquired: false };
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseLock(lock);
  }
};

export default { acquireLock, releaseLock, withLock };
