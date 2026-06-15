import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis } from '../infra/redis.js';

const productSearchNamespace = 'search:products';

export async function getCachedValue<T>(options: {
  namespace: string;
  ttlSeconds: number;
  keyPayload: unknown;
  loader: () => Promise<T>;
}): Promise<T> {
  if (!env.ENABLE_SEARCH_CACHE) {
    return options.loader();
  }

  try {
    const version = await getNamespaceVersion(options.namespace);
    const cacheKey = buildCacheKey(options.namespace, version, options.keyPayload);
    const cachedValue = await redis.get(cacheKey);

    if (cachedValue !== null) {
      return JSON.parse(cachedValue) as T;
    }

    const freshValue = await options.loader();
    await redis.set(cacheKey, JSON.stringify(freshValue), 'EX', options.ttlSeconds);
    return freshValue;
  } catch (error) {
    logger.warn('Redis cache lookup failed; falling back to source', {
      error,
      namespace: options.namespace
    });

    return options.loader();
  }
}

export async function invalidateProductSearchCache(): Promise<void> {
  if (!env.ENABLE_SEARCH_CACHE) {
    return;
  }

  try {
    await bumpNamespaceVersion(productSearchNamespace);
  } catch (error) {
    logger.warn('Redis cache invalidation failed', { error, namespace: productSearchNamespace });
  }
}

export const productSearchCacheNamespace = productSearchNamespace;

async function getNamespaceVersion(namespace: string): Promise<string> {
  const namespaceKey = `${namespace}:version`;
  const current = await redis.get(namespaceKey);

  if (current !== null) {
    return current;
  }

  await redis.set(namespaceKey, '1');
  return '1';
}

async function bumpNamespaceVersion(namespace: string): Promise<void> {
  const namespaceKey = `${namespace}:version`;
  await redis.incr(namespaceKey);
}

function buildCacheKey(namespace: string, version: string, payload: unknown): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  return `${namespace}:v${version}:${digest}`;
}
