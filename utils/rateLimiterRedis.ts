/**
 * 🔒 RATE LIMITER WITH REDIS - JR CHATEAM v6.0.0
 *
 * Sistema de rate limiting avanzado con Redis para WhatsApp
 * - Límites por conversación
 * - Límites por usuario
 * - Límites por número de WhatsApp
 * - Ventanas deslizantes (sliding window)
 * - Distribu

ido en múltiples servidores
 *
 * @version 2.0.0 - Fase 2
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import Redis from "ioredis";
import logger, { logError, logInfo, logWarn } from "./logger";

/**
 * Configuración de límites
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

/**
 * Resultado del rate limiting
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  blocked: boolean;
  retryAfter?: number;
}

/**
 * 🔒 REDIS RATE LIMITER CLASS
 */
export class RedisRateLimiter {
  private redis: Redis;
  private prefix: string;

  constructor(redisUrl?: string, prefix: string = "ratelimit") {
    const url = redisUrl || process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;

    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 3) {
          logError("❌ Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 50, 2000);
      }
    });

    this.prefix = prefix;

    this.redis.on("connect", () => {
      logInfo("✅ Redis Rate Limiter connected");
    });

    this.redis.on("error", (err) => {
      logError("❌ Redis Rate Limiter error", { error: err.message });
    });

    logInfo("🔒 Redis Rate Limiter initialized", { prefix });
  }

  /**
   * 🔍 Verificar límite usando algoritmo de sliding window
   */
  async checkLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // 1. Verificar si está bloqueado
      const blockKey = `${fullKey}:blocked`;
      const blocked = await this.redis.get(blockKey);

      if (blocked) {
        const ttl = await this.redis.ttl(blockKey);
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(now + ttl * 1000),
          blocked: true,
          retryAfter: ttl
        };
      }

      // 2. Usar sorted set para sliding window
      const multi = this.redis.multi();

      // Remover entradas antiguas fuera de la ventana
      multi.zremrangebyscore(fullKey, 0, windowStart);

      // Contar requests en la ventana actual
      multi.zcard(fullKey);

      // Agregar la request actual
      multi.zadd(fullKey, now, `${now}-${Math.random()}`);

      // Establecer expiración de la key
      multi.expire(fullKey, Math.ceil(config.windowMs / 1000));

      const results = await multi.exec();

      // Obtener count de requests
      const count = results[1][1] as number;

      // 3. Verificar si excede el límite
      if (count >= config.maxRequests) {
        // Bloquear si se configuró blockDuration
        if (config.blockDurationMs) {
          await this.redis.setex(
            blockKey,
            Math.ceil(config.blockDurationMs / 1000),
            "1"
          );
        }

        logWarn("⚠️ Rate limit exceeded", {
          key,
          count,
          limit: config.maxRequests,
          blocked: !!config.blockDurationMs
        });

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(now + config.windowMs),
          blocked: !!config.blockDurationMs,
          retryAfter: config.blockDurationMs ? Math.ceil(config.blockDurationMs / 1000) : undefined
        };
      }

      // 4. Permitir request
      const remaining = config.maxRequests - count - 1;

      return {
        allowed: true,
        remaining,
        resetAt: new Date(now + config.windowMs),
        blocked: false
      };

    } catch (error) {
      logError("❌ Rate limit check error", {
        key,
        error: error.message
      });

      // En caso de error, permitir (fail-open)
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now + config.windowMs),
        blocked: false
      };
    }
  }

  /**
   * 📊 Obtener estado actual del límite
   */
  async getStatus(key: string): Promise<{
    count: number;
    blocked: boolean;
    ttl: number;
  }> {
    const fullKey = `${this.prefix}:${key}`;
    const blockKey = `${fullKey}:blocked`;

    try {
      const [count, blocked, ttl] = await Promise.all([
        this.redis.zcard(fullKey),
        this.redis.exists(blockKey),
        this.redis.ttl(fullKey)
      ]);

      return {
        count,
        blocked: blocked === 1,
        ttl
      };

    } catch (error) {
      logError("❌ Get status error", {
        key,
        error: error.message
      });

      return { count: 0, blocked: false, ttl: 0 };
    }
  }

  /**
   * 🔓 Desbloquear una key específica
   */
  async unblock(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    const blockKey = `${fullKey}:blocked`;

    try {
      await this.redis.del(blockKey);
      logInfo("🔓 Rate limit unblocked", { key });
    } catch (error) {
      logError("❌ Unblock error", {
        key,
        error: error.message
      });
    }
  }

  /**
   * 🧹 Limpiar límite (reset contador)
   */
  async reset(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    const blockKey = `${fullKey}:blocked`;

    try {
      await Promise.all([
        this.redis.del(fullKey),
        this.redis.del(blockKey)
      ]);

      logInfo("🧹 Rate limit reset", { key });
    } catch (error) {
      logError("❌ Reset error", {
        key,
        error: error.message
      });
    }
  }

  /**
   * 🔍 Obtener todas las keys bloqueadas
   */
  async getBlockedKeys(): Promise<string[]> {
    try {
      const pattern = `${this.prefix}:*:blocked`;
      const keys = await this.redis.keys(pattern);

      return keys.map(key => key.replace(`${this.prefix}:`, "").replace(":blocked", ""));

    } catch (error) {
      logError("❌ Get blocked keys error", { error: error.message });
      return [];
    }
  }

  /**
   * 📈 Obtener métricas globales
   */
  async getMetrics(): Promise<{
    totalKeys: number;
    blockedKeys: number;
    topKeys: Array<{ key: string; count: number }>;
  }> {
    try {
      const pattern = `${this.prefix}:*`;
      const allKeys = await this.redis.keys(pattern);

      // Filtrar keys de bloqueo
      const dataKeys = allKeys.filter(k => !k.endsWith(":blocked"));
      const blockKeys = allKeys.filter(k => k.endsWith(":blocked"));

      // Obtener top 10 keys por count
      const counts = await Promise.all(
        dataKeys.slice(0, 100).map(async key => ({
          key: key.replace(`${this.prefix}:`, ""),
          count: await this.redis.zcard(key)
        }))
      );

      const topKeys = counts
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalKeys: dataKeys.length,
        blockedKeys: blockKeys.length,
        topKeys
      };

    } catch (error) {
      logError("❌ Get metrics error", { error: error.message });
      return { totalKeys: 0, blockedKeys: 0, topKeys: [] };
    }
  }

  /**
   * 🛑 Cerrar conexión Redis
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logInfo("🛑 Redis Rate Limiter closed");
  }
}

/**
 * 🔒 WHATSAPP SPECIFIC RATE LIMITERS
 */
export class WhatsappRateLimiter {
  private limiter: RedisRateLimiter;

  constructor(redisUrl?: string) {
    this.limiter = new RedisRateLimiter(redisUrl, "whatsapp:ratelimit");
  }

  /**
   * 💬 Rate limit por conversación
   */
  async checkConversationLimit(
    conversationId: string,
    maxMessages: number = 30,
    windowMinutes: number = 60
  ): Promise<RateLimitResult> {
    return this.limiter.checkLimit(`conversation:${conversationId}`, {
      maxRequests: maxMessages,
      windowMs: windowMinutes * 60 * 1000,
      blockDurationMs: 15 * 60 * 1000 // Bloquear 15 minutos si excede
    });
  }

  /**
   * 👤 Rate limit por usuario (companyId + userId)
   */
  async checkUserLimit(
    companyId: number,
    userId: number,
    maxMessages: number = 100,
    windowMinutes: number = 60
  ): Promise<RateLimitResult> {
    return this.limiter.checkLimit(`user:${companyId}:${userId}`, {
      maxRequests: maxMessages,
      windowMs: windowMinutes * 60 * 1000
    });
  }

  /**
   * 📱 Rate limit por número de WhatsApp
   */
  async checkWhatsappLimit(
    whatsappId: number,
    maxMessages: number = 500,
    windowMinutes: number = 60
  ): Promise<RateLimitResult> {
    return this.limiter.checkLimit(`whatsapp:${whatsappId}`, {
      maxRequests: maxMessages,
      windowMs: windowMinutes * 60 * 1000
    });
  }

  /**
   * 🌐 Rate limit global por compañía
   */
  async checkCompanyLimit(
    companyId: number,
    maxMessages: number = 1000,
    windowMinutes: number = 60
  ): Promise<RateLimitResult> {
    return this.limiter.checkLimit(`company:${companyId}`, {
      maxRequests: maxMessages,
      windowMs: windowMinutes * 60 * 1000
    });
  }

  /**
   * 📊 Obtener métricas
   */
  async getMetrics() {
    return this.limiter.getMetrics();
  }

  /**
   * 🔓 Desbloquear conversación
   */
  async unblockConversation(conversationId: string) {
    return this.limiter.unblock(`conversation:${conversationId}`);
  }

  /**
   * 🧹 Reset límite de conversación
   */
  async resetConversation(conversationId: string) {
    return this.limiter.reset(`conversation:${conversationId}`);
  }

  /**
   * 📈 Obtener estado de conversación
   */
  async getConversationStatus(conversationId: string) {
    return this.limiter.getStatus(`conversation:${conversationId}`);
  }

  /**
   * 🛑 Cerrar
   */
  async close() {
    return this.limiter.close();
  }
}

/**
 * 🌟 Instancia singleton
 */
export const whatsappRateLimiter = new WhatsappRateLimiter();

/**
 * 📤 Exports
 */
export default whatsappRateLimiter;
