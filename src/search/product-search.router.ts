import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { parseProductSearchRequest } from './product-search-request.js';
import { productSearchService } from './product-search-service.js';

export const productSearchRouter = Router();

productSearchRouter.post(
  '/products',
  (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const request = parseProductSearchRequest(req.body);
      const result = await productSearchService.searchProducts(request);

      res.status(200).json(result);
    })().catch((error: unknown) => {
      next(error);
    });
  }
);
