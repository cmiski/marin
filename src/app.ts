import 'reflect-metadata';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { openApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { getReadinessStatus } from './operations/health.js';
import { metricsMiddleware, metricsRegistry } from './operations/metrics.js';
import { searchEventsRouter } from './search/search-events.router.js';
import { productSearchRouter } from './search/product-search.router.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'elasticsearch-search-service',
      environment: env.NODE_ENV
    });
  });

  app.get('/health/ready', (_req, res, next) => {
    void getReadinessStatus()
      .then((readiness) => {
        res.status(readiness.status === 'ok' ? 200 : 503).json(readiness);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  app.get('/metrics', (_req, res, next) => {
    void metricsRegistry
      .metrics()
      .then((metrics) => {
        res.set('Content-Type', metricsRegistry.contentType);
        res.status(200).send(metrics);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiDocument);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use('/api/search', productSearchRouter);
  app.use('/webhooks/search', searchEventsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug('Express application configured');

  return app;
}
