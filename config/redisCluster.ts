/**
 * ⚠️ REDIS CLUSTER CONFIG — JR CHATEAM v6.0.0
 *
 * HISTÓRICO: Este archivo definía un cluster Redis ficticio (puertos 7001-7006)
 * que nunca existieron en producción, causando ECONNREFUSED y crasheos.
 *
 * CORRECCIÓN 25-Mar-2026: Se reconfigura para usar el Redis real de Docker
 * en puerto 5000, SIN cluster, para evitar crasheos.
 *
 * @date 25 de marzo de 2026
 */

import Redis from 'ioredis';
import logger from './logger';

// ============================================================================
// CONFIGURACIÓN: Cliente Redis único (NO cluster)
// ============================================================================

// Construir URL de Redis con autenticación
const redisPassword = process.env.REDIS_PASSWORD || '';
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || '5000';

// Usar REDIS_URL si está definido, sino construir con autenticación
const REDIS_URL = process.env.REDIS_URL
  ? process.env.REDIS_URL
  : redisPassword
    ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
    : `redis://${redisHost}:${redisPort}`;

// Cliente único — se comparte en toda la app
export const redisCluster = new Redis(REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: null,          // No bloquear comandos si Redis falla
  enableOfflineQueue: false,             // NO guardar comandos si no hay conexión
  retryStrategy: (times: number) => {
    if (times > 20) {
      logger.warn('[Redis] Max reintentos alcanzados (20). Deteniendo.');
      return null; // Detiene reintentos — la app sigue funcionando
    }
    const delay = Math.min(times * 200, 3000);
    logger.warn(`[Redis] Reconectando en ${delay}ms (intento ${times})`);
    return delay;
  },
});

// ============================================================================
// EVENT HANDLERS — previenen crasheos del proceso
// ============================================================================

redisCluster.on('connect', () => {
  logger.info('[Redis] ✅ Conectado exitosamente');
});

redisCluster.on('ready', () => {
  logger.info('[Redis] ✅ Listo para aceptar comandos');
});

redisCluster.on('error', (err) => {
  // Solo WARN — NO lanza ni crashea el proceso
  logger.warn(`[Redis] ⚠️ Error de conexión: ${err.message}`);
});

redisCluster.on('close', () => {
  logger.warn('[Redis] Conexión cerrada');
});

redisCluster.on('reconnecting', () => {
  logger.info('[Redis] Reconectando...');
});

// ============================================================================
// CACHE HELPER CLASS
// ============================================================================

export class CacheService {
  private prefix: string;

  constructor(prefix: string = 'cache') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisCluster.get(this.getKey(key));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    try {
      await redisCluster.setex(this.getKey(key), ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await redisCluster.del(this.getKey(key));
      return true;
    } catch (error) {
      logger.error(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await redisCluster.keys(this.getKey(pattern));
      if (keys.length === 0) return 0;
      const pipeline = redisCluster.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();
      return keys.length;
    } catch (error) {
      logger.error(`Cache DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisCluster.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error(`Cache EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await redisCluster.ttl(this.getKey(key));
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const value = await redisCluster.incr(this.getKey(key));
      if (ttl && value === 1) {
        await redisCluster.expire(this.getKey(key), ttl);
      }
      return value;
    } catch (error) {
      logger.error(`Cache INCR error for key ${key}:`, error);
      return 0;
    }
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
      const fresh = await fetchFn();
      await this.set(key, fresh, ttl);
      return fresh;
    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      return await fetchFn(); // Fail-open: devolver datos frescos
    }
  }

  async invalidateCompany(companyId: number): Promise<void> {
    await this.delPattern(`*:company:${companyId}:*`);
  }

  async invalidateUser(userId: number): Promise<void> {
    await this.delPattern(`*:user:${userId}:*`);
  }
}

// Pre-configured cache instances
export const ticketCache = new CacheService('tickets');
export const messageCache = new CacheService('messages');
export const userCache = new CacheService('users');
export const contactCache = new CacheService('contacts');
export const analyticsCache = new CacheService('analytics');

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis connection...');
  await redisCluster.quit();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis connection...');
  await redisCluster.quit();
});
