/**
 * Heartbeat Service - Reporta liveness de este proceso a Redis
 *
 * Cada proceso hace SETEX cada 10s con TTL 30s.
 * Si el proceso muere, Redis expira la key automáticamente en 30s.
 */
import cacheLayer from "./cache";
import { sessionRegistry } from "./sessionRegistry";
import logger from "../utils/logger";

const HEARTBEAT_PREFIX = "nodes:heartbeat:";
const HEARTBEAT_INTERVAL = 10000; // 10 segundos
const HEARTBEAT_TTL = 30; // 30 segundos

let heartbeatTimer: NodeJS.Timeout | null = null;
let redisReady = false;

export function startHeartbeat(): void {
  const nodeId = sessionRegistry.getNodeId();
  const redis = cacheLayer.getRedisInstance();

  // Esperar a que Redis esté listo antes de iniciar heartbeat
  const waitForRedis = () => {
    return new Promise<void>(resolve => {
      if (redisReady) { resolve(); return; }
      const check = () => {
        if (redis.status === "ready") {
          redisReady = true;
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  };

  const beat = async () => {
    if (!redisReady) return;
    try {
      const sessionsCount = (await sessionRegistry.getNodeSessions()).length;
      const value = JSON.stringify({
        status: "alive",
        timestamp: Date.now(),
        sessions: sessionsCount,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        port: sessionRegistry.getPort()
      });
      await redis.setex(`${HEARTBEAT_PREFIX}${nodeId}`, HEARTBEAT_TTL, value);
    } catch (error: any) {
      // Solo warn si Redis falla transitoriamente
      if (error.message?.includes("Stream isn't writeable")) return;
      logger.error(`[Heartbeat] Error reporting heartbeat: ${error.message}`);
    }
  };

  // Iniciar heartbeat tras delay para asegurar que Redis está listo
  setTimeout(async () => {
    await waitForRedis();
    beat(); // beat inmediato
    heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL);
    logger.info(`[Heartbeat] Started for ${nodeId} (every ${HEARTBEAT_INTERVAL / 1000}s, TTL ${HEARTBEAT_TTL}s)`);
  }, 5000);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    logger.info("[Heartbeat] Stopped");
  }
}

/** Verificar si un nodo está vivo */
export async function isNodeAlive(nodeId: string): Promise<boolean> {
  const redis = cacheLayer.getRedisInstance();
  const value = await redis.get(`${HEARTBEAT_PREFIX}${nodeId}`);
  return value !== null;
}

/** Obtener todos los nodos vivos */
export async function getAliveNodes(): Promise<string[]> {
  const redis = cacheLayer.getRedisInstance();
  const keys = await redis.keys(`${HEARTBEAT_PREFIX}*`);
  return keys.map(k => k.replace(HEARTBEAT_PREFIX, ""));
}
