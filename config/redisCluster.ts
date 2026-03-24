import Redis from 'ioredis';
import logger from './logger';

// Redis Cluster Configuration
const redisClusterNodes = [
  { host: process.env.REDIS_NODE_1_HOST || 'localhost', port: 7001 },
  { host: process.env.REDIS_NODE_2_HOST || 'localhost', port: 7002 },
  { host: process.env.REDIS_NODE_3_HOST || 'localhost', port: 7003 },
  { host: process.env.REDIS_NODE_4_HOST || 'localhost', port: 7004 },
  { host: process.env.REDIS_NODE_5_HOST || 'localhost', port: 7005 },
  { host: process.env.REDIS_NODE_6_HOST || 'localhost', port: 7006 }
];

// Redis Cluster Instance
export const redisCluster = new Redis.Cluster(redisClusterNodes, {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true
  },
  clusterRetryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableOfflineQueue: true,
  scaleReads: 'slave', // Read from slaves
  maxRedirections: 16
});

// Connection Events
redisCluster.on('connect', () => {
  logger.info('Redis Cluster connected successfully');
});

redisCluster.on('ready', () => {
  logger.info('Redis Cluster is ready to accept commands');
});

redisCluster.on('error', (err) => {
  logger.error('Redis Cluster error:', err);
});

redisCluster.on('close', () => {
  logger.warn('Redis Cluster connection closed');
});

redisCluster.on('reconnecting', () => {
  logger.info('Redis Cluster reconnecting...');
});

// Cache Helper Class
export class CacheService {
  private prefix: string;

  constructor(prefix: string = 'cache') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisCluster.get(this.getKey(key));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      await redisCluster.setex(this.getKey(key), ttl, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key: string): Promise<boolean> {
    try {
      await redisCluster.del(this.getKey(key));
      return true;
    } catch (error) {
      logger.error(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
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

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisCluster.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error(`Cache EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL
   */
  async ttl(key: string): Promise<number> {
    try {
      return await redisCluster.ttl(this.getKey(key));
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Increment counter
   */
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

  /**
   * Cache-aside pattern with automatic refresh
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch fresh data
      const fresh = await fetchFn();

      // Store in cache
      await this.set(key, fresh, ttl);

      return fresh;
    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      // Return fresh data even if cache fails
      return await fetchFn();
    }
  }

  /**
   * Invalidate cache for company
   */
  async invalidateCompany(companyId: number): Promise<void> {
    await this.delPattern(`*:company:${companyId}:*`);
  }

  /**
   * Invalidate cache for user
   */
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis Cluster connection...');
  await redisCluster.quit();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis Cluster connection...');
  await redisCluster.quit();
});
