import Redis from "ioredis";
import hmacSHA512 from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import { REDIS_URI_CONNECTION } from "../config/redis";

class CacheSingleton {
  private redis: Redis;

  private static instance: CacheSingleton;

  private constructor(redisInstance: Redis) {
    this.redis = redisInstance;
  }

  public static getInstance(redisInstance: Redis): CacheSingleton {
    if (!CacheSingleton.instance) {
      CacheSingleton.instance = new CacheSingleton(redisInstance);
    }
    return CacheSingleton.instance;
  }

  private static encryptParams(params: any) {
    const str = JSON.stringify(params);
    const key = Base64.stringify(hmacSHA512(params, str));
    return key;
  }

  public async set(
    key: string,
    value: string,
    option?: string,
    optionValue?: string | number
  ): Promise<string> {
    if (option !== undefined && optionValue !== undefined) {
      // @ts-ignore - Redis set accepts variable arguments
      return this.redis.set(key, value, option, optionValue);
    }

    return this.redis.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  public async getKeys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  public async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  public async delFromPattern(pattern: string): Promise<void> {
    const all = await this.getKeys(pattern);
    await Promise.all(all.map(item => this.del(item)));
  }

  public async setFromParams(
    key: string,
    params: any,
    value: string,
    option?: string,
    optionValue?: string | number
  ): Promise<string> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    if (option !== undefined && optionValue !== undefined) {
      return this.set(finalKey, value, option, optionValue);
    }
    return this.set(finalKey, value);
  }

  public async getFromParams(key: string, params: any): Promise<string | null> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    return this.get(finalKey);
  }

  public async delFromParams(key: string, params: any): Promise<number> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    return this.del(finalKey);
  }

  public getRedisInstance(): Redis {
    return this.redis;
  }
}

const redisInstance = new Redis(REDIS_URI_CONNECTION, {
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.warn(`[Redis] Max retries (${times}) reached. Giving up.`);
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 3000);
    console.warn(`[Redis] Reconnecting in ${delay}ms... (attempt ${times})`);
    return delay;
  },
  maxRetriesPerRequest: null,       // allow commands to fail instead of blocking
  enableOfflineQueue: false,        // fail fast if Redis unavailable
  lazyConnect: false,
});

// Prevent ioredis unhandled error events from crashing the process
redisInstance.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redisInstance.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redisInstance.on('ready', () => {
  console.log('[Redis] Ready to accept commands');
});

redisInstance.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});

export default CacheSingleton.getInstance(redisInstance);