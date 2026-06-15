import type { estypes } from '@elastic/elasticsearch';
import { elasticsearch } from '../infra/elasticsearch.js';
import { prisma } from '../infra/prisma.js';
import { logger } from '../config/logger.js';
import { PRODUCT_INDEX_ALIAS } from './product-index.js';
import type { IndexingEvent } from './indexing-events.js';
import {
  toProductSearchDocument,
  type ProductSearchDocument
} from './product-document.js';
import { findProductsForIndexing } from './product-source.js';
import { invalidateProductSearchCache } from './search-cache.js';

type UpsertResult = {
  indexed: number;
  missing: string[];
};

type DeleteResult = {
  deleted: number;
};

type IndexingOptions = {
  recordProcessedEvents?: boolean;
  invalidateCache?: boolean;
};

export type IndexingBatchResult = {
  indexed: number;
  deleted: number;
  missing: string[];
};

export class ProductIndexingService {
  public async processEvents(
    events: IndexingEvent[],
    options: IndexingOptions = {}
  ): Promise<IndexingBatchResult> {
    const recordProcessedEvents = options.recordProcessedEvents ?? true;
    const invalidateCache = options.invalidateCache ?? true;
    const upsertIds = uniqueIds(
      events
        .filter((event) => event.operation === 'UPSERT')
        .map((event) => event.aggregateId)
    );
    const deleteIds = uniqueIds(
      events
        .filter((event) => event.operation === 'DELETE')
        .map((event) => event.aggregateId)
    ).filter((productId) => !upsertIds.includes(productId));

    const [upserted, deleted] = await Promise.all([
      this.bulkUpsertProducts(upsertIds, { recordProcessedEvents }),
      this.bulkDeleteProducts(deleteIds, { recordProcessedEvents })
    ]);

    if (
      invalidateCache &&
      (upserted.indexed > 0 || upserted.missing.length > 0 || deleted.deleted > 0)
    ) {
      await invalidateProductSearchCache();
    }

    return {
      indexed: upserted.indexed,
      deleted: deleted.deleted,
      missing: upserted.missing
    };
  }

  public async bulkUpsertProducts(
    productIds: string[],
    options: Pick<IndexingOptions, 'recordProcessedEvents'> = {}
  ): Promise<UpsertResult> {
    const recordProcessedEvents = options.recordProcessedEvents ?? true;

    if (productIds.length === 0) {
      return {
        indexed: 0,
        missing: []
      };
    }

    const products = await findProductsForIndexing(productIds);
    const foundIds = new Set(products.map((product) => product.id));
    const missing = productIds.filter((productId) => !foundIds.has(productId));
    const operations: Array<estypes.BulkOperationContainer | ProductSearchDocument> = [];

    for (const product of products) {
      operations.push({
        index: {
          _index: PRODUCT_INDEX_ALIAS,
          _id: product.id
        }
      });
      operations.push(toProductSearchDocument(product));
    }

    if (operations.length > 0) {
      const response = await elasticsearch.bulk({
        refresh: 'wait_for',
        operations
      });

      if (response.errors) {
        logger.error('Elasticsearch bulk upsert contained item errors', {
          items: response.items
        });
        throw new Error('Elasticsearch bulk upsert failed');
      }
    }

    if (recordProcessedEvents) {
      await this.recordProcessedEvents([
        ...productIds
          .filter((productId) => !missing.includes(productId))
          .map((aggregateId) => ({
            aggregateType: 'product',
            aggregateId,
            operation: 'UPSERT' as const,
            status: 'SUCCEEDED' as const,
            errorMessage: null
          })),
        ...missing.map((aggregateId) => ({
          aggregateType: 'product',
          aggregateId,
          operation: 'UPSERT' as const,
          status: 'FAILED' as const,
          errorMessage: 'Product missing from source of truth'
        }))
      ]);
    }

    return {
      indexed: products.length,
      missing
    };
  }

  public async bulkDeleteProducts(
    productIds: string[],
    options: Pick<IndexingOptions, 'recordProcessedEvents'> = {}
  ): Promise<DeleteResult> {
    const recordProcessedEvents = options.recordProcessedEvents ?? true;

    if (productIds.length === 0) {
      return {
        deleted: 0
      };
    }

    const operations: estypes.BulkOperationContainer[] = productIds.map((productId) => ({
      delete: {
        _index: PRODUCT_INDEX_ALIAS,
        _id: productId
      }
    }));

    const response = await elasticsearch.bulk({
      refresh: 'wait_for',
      operations
    });

    if (response.errors) {
      logger.error('Elasticsearch bulk delete contained item errors', {
        items: response.items
      });
      throw new Error('Elasticsearch bulk delete failed');
    }

    if (recordProcessedEvents) {
      await this.recordProcessedEvents(
        productIds.map((aggregateId) => ({
          aggregateType: 'product',
          aggregateId,
          operation: 'DELETE' as const,
          status: 'SUCCEEDED' as const,
          errorMessage: null
        }))
      );
    }

    return {
      deleted: productIds.length
    };
  }

  private async recordProcessedEvents(
    events: Array<{
      aggregateType: string;
      aggregateId: string;
      operation: 'UPSERT' | 'DELETE';
      status: 'SUCCEEDED' | 'FAILED';
      errorMessage: string | null;
    }>
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await prisma.searchOutboxEvent.createMany({
      data: events.map((event) => ({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        operation: event.operation,
        status: event.status,
        errorMessage: event.errorMessage,
        processedAt: new Date()
      }))
    });
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export const productIndexingService = new ProductIndexingService();
