import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../infra/prisma.js';
import type { IndexingEvent } from './indexing-events.js';
import { productIndexingService } from './product-indexing-service.js';

export class SearchOutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  public start(): void {
    if (!env.ENABLE_OUTBOX_WORKER) {
      logger.info('Search outbox worker disabled');
      return;
    }

    if (this.timer !== null) {
      return;
    }

    this.stopped = false;
    this.timer = setInterval(() => {
      void this.tick();
    }, env.OUTBOX_WORKER_INTERVAL_MS);
    this.timer.unref();
    void this.tick();

    logger.info('Search outbox worker started', {
      intervalMs: env.OUTBOX_WORKER_INTERVAL_MS,
      batchSize: env.OUTBOX_WORKER_BATCH_SIZE
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    while (this.running) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }

    this.running = true;

    try {
      const events = await this.claimPendingEvents();

      for (const event of events) {
        await this.processOutboxEvent(event);
      }
    } catch (error) {
      logger.error('Search outbox worker tick failed', { error });
    } finally {
      this.running = false;
    }
  }

  private async claimPendingEvents(): Promise<
    Array<{
      id: string;
      aggregateType: string;
      aggregateId: string;
      operation: 'UPSERT' | 'DELETE';
      attempts: number;
    }>
  > {
    const events = await prisma.searchOutboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: {
          lte: new Date()
        },
        attempts: {
          lt: env.OUTBOX_WORKER_MAX_ATTEMPTS
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: env.OUTBOX_WORKER_BATCH_SIZE,
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
        operation: true,
        attempts: true
      }
    });

    if (events.length === 0) {
      return [];
    }

    await prisma.searchOutboxEvent.updateMany({
      where: {
        id: {
          in: events.map((event) => event.id)
        },
        status: 'PENDING'
      },
      data: {
        status: 'PROCESSING'
      }
    });

    return events;
  }

  private async processOutboxEvent(event: {
    id: string;
    aggregateType: string;
    aggregateId: string;
    operation: 'UPSERT' | 'DELETE';
    attempts: number;
  }): Promise<void> {
    const indexingEvent: IndexingEvent = {
      aggregateType: 'product',
      aggregateId: event.aggregateId,
      operation: event.operation,
      reason: 'outbox-worker'
    };

    if (event.aggregateType !== 'product') {
      await this.markFailed(event, `Unsupported aggregate type: ${event.aggregateType}`);
      return;
    }

    try {
      const result = await productIndexingService.processEvents([indexingEvent], {
        recordProcessedEvents: false
      });

      if (result.missing.includes(event.aggregateId)) {
        await this.markFailed(event, 'Product missing from source of truth');
        return;
      }

      await prisma.searchOutboxEvent.update({
        where: {
          id: event.id
        },
        data: {
          status: 'SUCCEEDED',
          errorMessage: null,
          processedAt: new Date()
        }
      });
    } catch (error) {
      await this.markFailed(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async markFailed(
    event: {
      id: string;
      attempts: number;
    },
    message: string
  ): Promise<void> {
    const nextAttempts = event.attempts + 1;
    const exhausted = nextAttempts >= env.OUTBOX_WORKER_MAX_ATTEMPTS;

    await prisma.searchOutboxEvent.update({
      where: {
        id: event.id
      },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts: {
          increment: 1
        },
        errorMessage: message,
        availableAt: exhausted
          ? new Date()
          : new Date(Date.now() + retryDelayMs(nextAttempts))
      }
    });
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export const searchOutboxWorker = new SearchOutboxWorker();
