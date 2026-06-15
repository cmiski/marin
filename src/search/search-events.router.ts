import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { parseIndexingWebhookPayload } from './indexing-events.js';
import { productIndexingService } from './product-indexing-service.js';

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
