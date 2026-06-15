import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info(`Search service listening on port ${String(env.PORT)}`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`Received ${signal}; shutting down HTTP server`);
  server.close((error) => {
    if (error) {
      logger.error('HTTP server shutdown failed', { error });
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
