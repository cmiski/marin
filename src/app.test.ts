import type { NextFunction, Request, Response } from 'express';
import type express from 'express';
import { jest, describe, expect, it, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';

const mockSearchProducts = jest.fn(async (_request: unknown) => ({
  query: 'headphones',
  sort: 'relevance',
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  },
  results: [],
  facets: {
    brands: [],
    categories: [],
    tags: [],
    priceRanges: [],
    availability: []
  }
}));

const mockAutocompleteProducts = jest.fn(async (_request: unknown) => ({
  query: 'hea',
  suggestions: []
}));

const mockProcessEvents = jest.fn(async (_events: unknown) => ({
  indexed: 1,
  deleted: 0,
  missing: []
}));

const mockStartReindex = jest.fn((_request: unknown) => ({
  id: 'job-1',
  mode: 'full',
  status: 'running',
  startedAt: '2026-06-16T00:00:00.000Z',
  finishedAt: null,
  updatedSince: null,
  batchesProcessed: 0,
  indexed: 0,
  missing: [],
  lastIndexedId: null,
  error: null
}));

const mockGetStatus = jest.fn(() => ({
  id: 'job-1',
  mode: 'full',
  status: 'running',
  startedAt: '2026-06-16T00:00:00.000Z',
  finishedAt: null,
  updatedSince: null,
  batchesProcessed: 0,
  indexed: 0,
  missing: [],
  lastIndexedId: null,
  error: null
}));

jest.mock('./search/product-search-service.js', () => ({
  productSearchService: {
    searchProducts: mockSearchProducts
  }
}));

jest.mock('./search/product-autocomplete-service.js', () => ({
  productAutocompleteService: {
    autocompleteProducts: mockAutocompleteProducts
  }
}));

jest.mock('./search/product-indexing-service.js', () => ({
  productIndexingService: {
    processEvents: mockProcessEvents
  }
}));

jest.mock('./search/product-reindex-service.js', () => ({
  productReindexService: {
    startReindex: mockStartReindex,
    getStatus: mockGetStatus
  }
}));

jest.mock('./operations/health.js', () => ({
  getReadinessStatus: jest.fn(async () => ({
    status: 'ok',
    service: 'elasticsearch-search-service',
    environment: 'test',
    dependencies: {
      postgres: { status: 'ok', latencyMs: 1 },
      elasticsearch: { status: 'ok', latencyMs: 1 },
      redis: { status: 'ok', latencyMs: 1 }
    }
  }))
}));

jest.mock('./operations/metrics.js', () => ({
  metricsMiddleware: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
  metricsRegistry: {
    contentType: 'text/plain; version=0.0.4',
    metrics: jest.fn(async () => 'search_service_http_requests_total 1\n')
  }
}));

let app: express.Express;

describe('createApp', () => {
  beforeAll(async () => {
    const { createApp } = await import('./app.js');
    app = createApp();
  });

  beforeEach(() => {
    mockSearchProducts.mockClear();
    mockAutocompleteProducts.mockClear();
    mockProcessEvents.mockClear();
    mockStartReindex.mockClear();
    mockGetStatus.mockClear();
  });

  it('returns liveness status', async () => {
    const response = await request(app).get('/health/live').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'elasticsearch-search-service',
      environment: 'test'
    });
  });

  it('returns readiness status', async () => {
    const response = await request(app).get('/health/ready').expect(200);

    expect(response.body.dependencies.postgres.status).toBe('ok');
  });

  it('serves OpenAPI and metrics endpoints', async () => {
    const openApiResponse = await request(app).get('/openapi.json').expect(200);
    const metricsResponse = await request(app).get('/metrics').expect(200);

    expect(openApiResponse.body.openapi).toBe('3.0.3');
    expect(metricsResponse.text).toContain('search_service_http_requests_total');
  });

  it('searches products through the router', async () => {
    const response = await request(app)
      .post('/api/search/products')
      .send({
        query: 'headphones'
      })
      .expect(200);

    expect(response.body.results).toEqual([]);
    expect(mockSearchProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'headphones',
        page: 1
      })
    );
  });

  it('validates product search payloads', async () => {
    await request(app)
      .post('/api/search/products')
      .send({
        pageSize: 200
      })
      .expect(400);
  });

  it('returns autocomplete suggestions through the router', async () => {
    await request(app)
      .post('/api/search/products/autocomplete')
      .send({
        query: 'hea'
      })
      .expect(200);

    expect(mockAutocompleteProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hea',
        limit: 8
      })
    );
  });

  it('accepts indexing webhooks', async () => {
    const response = await request(app)
      .post('/webhooks/search/indexing')
      .send({
        events: [
          {
            aggregateType: 'product',
            aggregateId: '6f9dce45-6093-44ff-bfd9-64bc217157d4',
            operation: 'UPSERT'
          }
        ]
      })
      .expect(202);

    expect(response.body.processedEvents).toBe(1);
    expect(mockProcessEvents).toHaveBeenCalledTimes(1);
  });

  it('starts and reports product reindex jobs', async () => {
    await request(app)
      .post('/webhooks/search/reindex/products')
      .send({
        mode: 'full'
      })
      .expect(202);

    const statusResponse = await request(app)
      .get('/webhooks/search/reindex/products')
      .expect(200);

    expect(mockStartReindex).toHaveBeenCalledWith({ mode: 'full' });
    expect(statusResponse.body.job.status).toBe('running');
  });
});
