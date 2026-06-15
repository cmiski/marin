import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'search_service_'
});

const httpRequestTotal = new Counter({
  name: 'search_service_http_requests_total',
  help: 'Total number of HTTP requests received by the search service.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry]
});

const httpRequestDuration = new Histogram({
  name: 'search_service_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const endTimer = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode)
    };

    httpRequestTotal.inc(labels);
    endTimer(labels);
  });

  next();
}

function routeLabel(req: Request): string {
  const route = req.route as unknown;
  const routePath =
    isRecord(route) && typeof route.path === 'string' ? route.path : undefined;

  if (routePath === undefined) {
    return req.path;
  }

  return `${req.baseUrl}${routePath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
