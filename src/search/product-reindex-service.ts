import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../infra/prisma.js';
import {
  PRODUCT_INDEX_ALIAS,
  PRODUCT_INDEX_NAME,
  PRODUCT_INDEX_VERSION
} from './product-index.js';
import { productIndexingService } from './product-indexing-service.js';
import type { ProductReindexRequest } from './product-reindex-request.js';
import { findProductIdsForReindex } from './product-source.js';
import { invalidateProductSearchCache } from './search-cache.js';
import { setupProductIndex } from './setup-indices.js';

type ReindexJobStatus = 'idle' | 'running' | 'succeeded' | 'failed';

export type ProductReindexJob = {
  id: string;
  mode: ProductReindexRequest['mode'];
  status: ReindexJobStatus;
  startedAt: string;
  finishedAt: string | null;
  updatedSince: string | null;
  batchesProcessed: number;
  indexed: number;
  missing: string[];
  lastIndexedId: string | null;
  error: string | null;
};

export class ProductReindexService {
  private currentJob: ProductReindexJob | null = null;

  public startReindex(request: ProductReindexRequest): ProductReindexJob {
    if (this.currentJob?.status === 'running') {
      return this.currentJob;
    }

    const job: ProductReindexJob = {
      id: randomUUID(),
      mode: request.mode,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      updatedSince: request.updatedSince ?? null,
      batchesProcessed: 0,
      indexed: 0,
      missing: [],
      lastIndexedId: null,
      error: null
    };

    this.currentJob = job;
    void this.run(job).catch((error: unknown) => {
      this.failJob(job, error);
    });

    return job;
  }

  public getStatus(): ProductReindexJob {
    if (this.currentJob === null) {
      return {
        id: 'none',
        mode: 'full',
        status: 'idle',
        startedAt: '',
        finishedAt: null,
        updatedSince: null,
        batchesProcessed: 0,
        indexed: 0,
        missing: [],
        lastIndexedId: null,
        error: null
      };
    }

    return this.currentJob;
  }

  private async run(job: ProductReindexJob): Promise<void> {
    await setupProductIndex();

    const updatedSince =
      job.updatedSince === null ? undefined : new Date(job.updatedSince);
    let afterId: string | undefined;
    let productIds = await findProductIdsForReindex({
      batchSize: env.REINDEX_BATCH_SIZE,
      afterId,
      updatedSince
    });

    while (productIds.length > 0) {
      const result = await productIndexingService.bulkUpsertProducts(productIds, {
        recordProcessedEvents: false
      });

      job.batchesProcessed += 1;
      job.indexed += result.indexed;
      job.missing.push(...result.missing);
      afterId = productIds.at(-1);
      job.lastIndexedId = afterId ?? null;

      await this.recordIndexState(job);

      productIds = await findProductIdsForReindex({
        batchSize: env.REINDEX_BATCH_SIZE,
        afterId,
        updatedSince
      });
    }

    await invalidateProductSearchCache();
    job.status = 'succeeded';
    job.finishedAt = new Date().toISOString();
    await this.recordIndexState(job);

    logger.info('Product reindex job finished', {
      jobId: job.id,
      indexed: job.indexed,
      batchesProcessed: job.batchesProcessed
    });
  }

  private failJob(job: ProductReindexJob, error: unknown): void {
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Product reindex job failed', { error, jobId: job.id });
  }

  private async recordIndexState(job: ProductReindexJob): Promise<void> {
    await prisma.searchIndexState.upsert({
      where: {
        indexName: PRODUCT_INDEX_NAME
      },
      create: {
        indexName: PRODUCT_INDEX_NAME,
        aliasName: PRODUCT_INDEX_ALIAS,
        schemaVersion: PRODUCT_INDEX_VERSION,
        lastIndexedAt: new Date(),
        lastIndexedId: job.lastIndexedId,
        documentCount: job.indexed
      },
      update: {
        aliasName: PRODUCT_INDEX_ALIAS,
        schemaVersion: PRODUCT_INDEX_VERSION,
        lastIndexedAt: new Date(),
        lastIndexedId: job.lastIndexedId,
        documentCount: job.indexed
      }
    });
  }
}

export const productReindexService = new ProductReindexService();
