import Redis from 'ioredis';
import logger from '../../config/logger.js';

export class RateLimitMonitor {
  private redisClient: Redis;

  constructor() {
    this.redisClient = new Redis(process.env.REDIS_URL || process.env.REDIS_URI || 'redis://127.0.0.1:5000', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });
    this.redisClient.on('error', (err) => console.warn('[RateLimitMonitor] Redis error:', err.message));
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
