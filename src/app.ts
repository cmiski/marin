import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { searchEventsRouter } from './search/search-events.router.js';
import { productSearchRouter } from './search/product-search.router.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'elasticsearch-search-service',
      environment: env.NODE_ENV
    });
  });

  app.use('/api/search', productSearchRouter);
  app.use('/webhooks/search', searchEventsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug('Express application configured');

  return app;
}
