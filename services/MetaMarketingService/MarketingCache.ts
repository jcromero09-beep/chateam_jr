import cache from "../../libs/cache";
import logger from "../../utils/logger";

// TTL en segundos
const CACHE_TTL = {
  CAMPAIGNS: 15 * 60,       // 15 minutos
  INSIGHTS: 30 * 60,        // 30 minutos
  ADS: 15 * 60,             // 15 minutos
  AGGREGATED: 60 * 60,      // 1 hora
  TRENDS: 30 * 60,          // 30 minutos
  AD_ACCOUNTS: 24 * 60 * 60 // 24 horas
};

const CACHE_PREFIX = "meta_marketing";

interface CacheOptions {
  companyId: number;
  accountId?: string;
  period?: string;
  level?: string;
  campaignId?: string;
}

/**
 * MarketingCache - Sistema de cache para Meta Marketing API
 *
 * Implementa cache con Redis para:
 * - Reducir llamadas a la API de Meta
 * - Evitar rate limits
 * - Mejorar rendimiento del dashboard
 */
export class MarketingCache {
  /**
   * Genera una clave única para el cache
   */
  private static generateKey(type: string, options: CacheOptions): string {
    const parts = [
      CACHE_PREFIX,
      type,
      `company_${options.companyId}`
    ];

    if (options.accountId) parts.push(`account_${options.accountId}`);
    if (options.period) parts.push(`period_${options.period}`);
    if (options.level) parts.push(`level_${options.level}`);
    if (options.campaignId) parts.push(`campaign_${options.campaignId}`);

    return parts.join(":");
  }

  /**
   * Obtiene datos del cache
   */
  static async get<T>(type: string, options: CacheOptions): Promise<T | null> {
    try {
      const key = this.generateKey(type, options);
      const cached = await cache.get(key);

      if (cached) {
        logger.debug(`[MarketingCache] HIT: ${key}`);
        return JSON.parse(cached) as T;
      }

      logger.debug(`[MarketingCache] MISS: ${key}`);
      return null;
    } catch (error: unknown) {
      logger.error(`[MarketingCache] Error getting cache: ${String(error)}`);
      return null;
    }
  }

  /**
   * Guarda datos en el cache
   */
  static async set(
    type: string,
    options: CacheOptions,
    data: any,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const key = this.generateKey(type, options);
      const ttl = ttlSeconds || this.getTTL(type);

      await cache.set(key, JSON.stringify(data), "EX", ttl);
      logger.debug(`[MarketingCache] SET: ${key} (TTL: ${ttl}s)`);
    } catch (error: unknown) {
      logger.error(`[MarketingCache] Error setting cache: ${String(error)}`);
    }
  }

  /**
   * Invalida cache para una empresa
   * Usa múltiples patrones para cubrir todos los casos:
   * - company_X:* (sin whatsappId, con segmentos adicionales)
   * - company_X_* (con whatsappId)
   * - company_X (sin segmentos adicionales, como ad_accounts)
   */
  static async invalidateCompany(companyId: number): Promise<void> {
    try {
      const patterns = [
        `${CACHE_PREFIX}:*:company_${companyId}:*`,   // company_1:period_30days
        `${CACHE_PREFIX}:*:company_${companyId}_*`,   // company_1_5:period_30days (con whatsappId)
        `${CACHE_PREFIX}:*:company_${companyId}`      // company_1 (sin trailing)
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const keys = await cache.getKeys(pattern);
        if (keys.length > 0) {
          logger.info(`[MarketingCache] Found ${keys.length} keys matching pattern: ${pattern}`);
          keys.forEach(key => logger.debug(`[MarketingCache] Deleting: ${key}`));
          await cache.delFromPattern(pattern);
          totalDeleted += keys.length;
        }
      }

      logger.info(`[MarketingCache] Invalidated ${totalDeleted} cache keys for company ${companyId}`);
    } catch (error: unknown) {
      logger.error(`[MarketingCache] Error invalidating cache: ${String(error)}`);
    }
  }

  /**
   * Invalida un tipo específico de cache
   * Usa múltiples patrones para cubrir todos los casos
   */
  static async invalidateType(type: string, companyId: number): Promise<void> {
    try {
      const patterns = [
        `${CACHE_PREFIX}:${type}:company_${companyId}:*`,   // con segmentos adicionales
        `${CACHE_PREFIX}:${type}:company_${companyId}_*`,   // con whatsappId
        `${CACHE_PREFIX}:${type}:company_${companyId}`      // sin trailing
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const keys = await cache.getKeys(pattern);
        if (keys.length > 0) {
          logger.info(`[MarketingCache] Found ${keys.length} keys for ${type} matching: ${pattern}`);
          await cache.delFromPattern(pattern);
          totalDeleted += keys.length;
        }
      }

      logger.info(`[MarketingCache] Invalidated ${totalDeleted} ${type} cache keys for company ${companyId}`);
    } catch (error: unknown) {
      logger.error(`[MarketingCache] Error invalidating type cache: ${String(error)}`);
    }
  }

  /**
   * Obtiene el TTL según el tipo de datos
   */
  private static getTTL(type: string): number {
    switch (type) {
      case "campaigns":
        return CACHE_TTL.CAMPAIGNS;
      case "insights":
        return CACHE_TTL.INSIGHTS;
      case "ads":
        return CACHE_TTL.ADS;
      case "aggregated":
        return CACHE_TTL.AGGREGATED;
      case "trends":
        return CACHE_TTL.TRENDS;
      case "ad_accounts":
        return CACHE_TTL.AD_ACCOUNTS;
      default:
        return CACHE_TTL.CAMPAIGNS;
    }
  }

  // ============================================================
  // MÉTODOS DE CONVENIENCIA
  // ============================================================

  static async getCampaigns(companyId: number, period: string): Promise<any[] | null> {
    return this.get<any[]>("campaigns", { companyId, period });
  }

  static async setCampaigns(companyId: number, period: string, data: any[]): Promise<void> {
    await this.set("campaigns", { companyId, period }, data);
  }

  static async getInsights(companyId: number, period: string): Promise<any | null> {
    return this.get<any>("insights", { companyId, period });
  }

  static async setInsights(companyId: number, period: string, data: any): Promise<void> {
    await this.set("insights", { companyId, period }, data);
  }

  static async getAds(companyId: number, period: string, campaignId?: string): Promise<any[] | null> {
    return this.get<any[]>("ads", { companyId, period, campaignId });
  }

  static async setAds(companyId: number, period: string, data: any[], campaignId?: string): Promise<void> {
    await this.set("ads", { companyId, period, campaignId }, data);
  }

  static async getTrends(companyId: number, period: string): Promise<any[] | null> {
    return this.get<any[]>("trends", { companyId, period });
  }

  static async setTrends(companyId: number, period: string, data: any[]): Promise<void> {
    await this.set("trends", { companyId, period }, data);
  }

  static async getAggregated(companyId: number, period: string): Promise<any | null> {
    return this.get<any>("aggregated", { companyId, period });
  }

  static async setAggregated(companyId: number, period: string, data: any): Promise<void> {
    await this.set("aggregated", { companyId, period }, data);
  }

  static async getAdAccounts(companyId: number): Promise<any[] | null> {
    return this.get<any[]>("ad_accounts", { companyId });
  }

  static async setAdAccounts(companyId: number, data: any[]): Promise<void> {
    await this.set("ad_accounts", { companyId }, data);
  }
}

export default MarketingCache;
