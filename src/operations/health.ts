import { env } from '../config/env.js';
import { elasticsearch } from '../infra/elasticsearch.js';
import { prisma } from '../infra/prisma.js';
import { redis } from '../infra/redis.js';

type DependencyStatus = {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
};

export type ReadinessStatus = {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  dependencies: {
    postgres: DependencyStatus;
    elasticsearch: DependencyStatus;
    redis: DependencyStatus;
  };
};

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const [postgres, elasticsearchStatus, redisStatus] = await Promise.all([
    checkDependency(async () => {
      await prisma.$queryRaw`SELECT 1`;
    }),
    checkDependency(async () => {
      await elasticsearch.ping();
    }),
    checkDependency(async () => {
      await redis.ping();
    })
  ]);

  const dependencies = {
    postgres,
    elasticsearch: elasticsearchStatus,
    redis: redisStatus
  };

  const ready = Object.values(dependencies).every(
    (dependency) => dependency.status === 'ok'
  );

  return {
    status: ready ? 'ok' : 'degraded',
    service: 'elasticsearch-search-service',
    environment: env.NODE_ENV,
    dependencies
  };
}

async function checkDependency(check: () => Promise<void>): Promise<DependencyStatus> {
  const startedAt = performance.now();

  try {
    await check();

    return {
      status: 'ok',
      latencyMs: elapsedMs(startedAt)
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: elapsedMs(startedAt),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
