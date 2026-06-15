import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './infra/prisma.js';
import { redis } from './infra/redis.js';
import { searchEventConsumer } from './search/search-event-consumer.js';
import { setupProductIndex } from './search/setup-indices.js';

const app = createApp();
const server = createServer(app);

async function start(): Promise<void> {
  await prisma.$connect();
  await setupProductIndex();
  await searchEventConsumer.start();

  server.listen(env.PORT, () => {
    logger.info(`Search service listening on port ${String(env.PORT)}`);
  });
}

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`Received ${signal}; shutting down HTTP server`);
  server.close((error) => {
    void searchEventConsumer
      .stop()
      .catch((consumerError: unknown) => {
        logger.error('Failed to stop RabbitMQ consumer cleanly', { error: consumerError });
      })
      .finally(() => {
        void Promise.allSettled([prisma.$disconnect(), redis.quit()]).finally(() => {
          if (error) {
            logger.error('HTTP server shutdown failed', { error });
            process.exit(1);
          }

          process.exit(0);
        });
      });
  });
}

void start().catch((error: unknown) => {
  logger.error('Search service startup failed', { error });
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
