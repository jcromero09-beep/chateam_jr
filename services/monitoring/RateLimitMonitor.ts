import Redis from 'ioredis';
import logger from '../../config/logger.js';

export class RateLimitMonitor {
  private redisClient: Redis;

  constructor() {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    });
  }

  async getRateLimitStats() {
    try {
      const keys = await this.redisClient.keys('rl:*');
      
      const stats = {
        totalKeys: keys.length,
        activeRateLimits: 0,
        limitsByType: {} as Record<string, number>,
      };

      for (const key of keys) {
        const ttl = await this.redisClient.ttl(key);
        
        if (ttl > 0) {
          stats.activeRateLimits++;
          const type = key.split(':')[1];
          stats.limitsByType[type] = (stats.limitsByType[type] || 0) + 1;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting rate limit stats', { error });
      throw error;
    }
  }

  async close() {
    await this.redisClient.quit();
  }
}

export default RateLimitMonitor;
