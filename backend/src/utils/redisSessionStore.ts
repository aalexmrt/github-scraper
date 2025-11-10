import Redis from 'ioredis';
import { logger } from './logger';

// Use environment variables for Redis connection
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

// Build Redis configuration (similar to queueService)
const isLocalRedis = !REDIS_TLS && !REDIS_PASSWORD;

const redisConfig: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: isLocalRedis ? null : 3,
  retryStrategy: (times: number) => {
    if (isLocalRedis) {
      if (times > 10) {
        return null;
      }
      return Math.min(times * 100, 1000);
    }
    if (times > 3) {
      return null;
    }
    return Math.min(times * 50, 200);
  },
  connectTimeout: isLocalRedis ? 20000 : 10000,
  commandTimeout: isLocalRedis ? 10000 : 5000,
  lazyConnect: false,
  keepAlive: 30000,
};

if (REDIS_PASSWORD) {
  redisConfig.password = REDIS_PASSWORD;
}

if (REDIS_TLS) {
  redisConfig.tls = {
    rejectUnauthorized: true,
  };
}

// Create Redis client for session storage
const redisClient = new Redis(redisConfig);

redisClient.on('error', (error) => {
  logger.error('[SESSION] Redis connection error:', error);
});

redisClient.on('connect', () => {
  logger.info('[SESSION] Redis connected for session storage');
});

// Session store implementation for @fastify/session
export class RedisSessionStore {
  private prefix: string;

  constructor(prefix: string = 'session:') {
    this.prefix = prefix;
  }

  private getKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  async set(sessionId: string, session: any, callback?: (err?: Error) => void): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      const value = JSON.stringify(session);
      // Set with expiration (7 days, matching cookie maxAge)
      await redisClient.setex(key, 60 * 60 * 24 * 7, value);
      callback?.();
    } catch (error: any) {
      logger.error('[SESSION] Error setting session:', error);
      callback?.(error);
    }
  }

  async get(sessionId: string, callback?: (err?: Error, session?: any) => void): Promise<any> {
    try {
      const key = this.getKey(sessionId);
      const value = await redisClient.get(key);
      if (!value) {
        callback?.(undefined, null);
        return null;
      }
      const session = JSON.parse(value);
      callback?.(undefined, session);
      return session;
    } catch (error: any) {
      logger.error('[SESSION] Error getting session:', error);
      callback?.(error);
      return null;
    }
  }

  async destroy(sessionId: string, callback?: (err?: Error) => void): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      await redisClient.del(key);
      callback?.();
    } catch (error: any) {
      logger.error('[SESSION] Error destroying session:', error);
      callback?.(error);
    }
  }

  async touch(sessionId: string, session: any, callback?: (err?: Error) => void): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      // Update expiration without changing value
      await redisClient.expire(key, 60 * 60 * 24 * 7);
      callback?.();
    } catch (error: any) {
      logger.error('[SESSION] Error touching session:', error);
      callback?.(error);
    }
  }
}

// Export singleton instance
export const redisSessionStore = new RedisSessionStore();

