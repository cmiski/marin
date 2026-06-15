import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true
});

redis.on('error', (error: unknown) => {
  logger.warn('Redis client error', { error });
});
