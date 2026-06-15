import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { parseIndexingWebhookPayload } from './indexing-events.js';
import { productIndexingService } from './product-indexing-service.js';
import { parseProductReindexRequest } from './product-reindex-request.js';
import { productReindexService } from './product-reindex-service.js';

export const searchEventsRouter = Router();

searchEventsRouter.post(
  '/indexing',
  (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const events = parseIndexingWebhookPayload(req.body);
      const result = await productIndexingService.processEvents(events);

      res.status(202).json({
        status: 'accepted',
        processedEvents: events.length,
        result
      });
    })().catch((error: unknown) => {
      next(error);
    });
  }
);

searchEventsRouter.post(
  '/reindex/products',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const request = parseProductReindexRequest(req.body);
      const job = productReindexService.startReindex(request);

      res.status(job.status === 'running' ? 202 : 200).json({
        status: job.status,
        job
      });
    } catch (error) {
      next(error);
    }
  }
);

searchEventsRouter.get(
  '/reindex/products',
  (_req: Request, res: Response): void => {
    res.status(200).json({
      job: productReindexService.getStatus()
    });
  }
);
