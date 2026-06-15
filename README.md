# Elasticsearch Search Service

Production-grade Node.js and TypeScript search service backed by PostgreSQL, Prisma, Elasticsearch, Redis, and optional RabbitMQ indexing events.

## Stack

- Node.js 20+, TypeScript strict mode, Express
- Elasticsearch 8.x for search, facets, autocomplete, fuzzy matching, and dense-vector fields
- PostgreSQL and Prisma as the source of truth
- Redis query cache with versioned invalidation
- Docker Compose for PostgreSQL, Redis, Elasticsearch, and Kibana
- Zod and class-validator request validation
- Winston structured logging
- Jest and Supertest tests
- OpenAPI docs and Prometheus metrics

## Architecture

PostgreSQL remains the system of record for products, brands, categories, variants, tags, and indexing state. Elasticsearch stores denormalized product documents optimized for retrieval. Redis caches hot search and autocomplete responses. Indexing can be triggered through REST webhooks, RabbitMQ messages, PostgreSQL outbox polling, or a full/incremental reindex job.

Main flows:

- Product updates create or publish indexing events.
- Events are processed into bulk Elasticsearch upserts or deletes.
- Search APIs query Elasticsearch with filters, scoring, facets, sorting, pagination, and highlighting.
- Cache entries are keyed by normalized request payload and invalidated by bumping a namespace version.
- Reindex jobs scan PostgreSQL in cursor batches and rebuild product documents.

## Local Setup

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis elasticsearch kibana
npm run prisma:generate
npm run prisma:migrate
npm run search:setup-index
npm run dev
```

Services:

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Metrics: `http://localhost:3000/metrics`
- Elasticsearch: `http://localhost:9200`
- Kibana: `http://localhost:5601`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Configuration

Important environment variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `ELASTICSEARCH_NODE`: Elasticsearch node URL.
- `REDIS_URL`: Redis connection string.
- `ENABLE_SEARCH_CACHE`: Enables Redis caching.
- `SEARCH_CACHE_TTL_SECONDS`: Search response TTL.
- `AUTOCOMPLETE_CACHE_TTL_SECONDS`: Autocomplete response TTL.
- `ENABLE_RABBITMQ_CONSUMER`: Enables RabbitMQ event consumption.
- `ENABLE_OUTBOX_WORKER`: Enables PostgreSQL outbox polling.
- `OUTBOX_WORKER_INTERVAL_MS`: Outbox polling interval.
- `OUTBOX_WORKER_BATCH_SIZE`: Outbox events claimed per tick.
- `OUTBOX_WORKER_MAX_ATTEMPTS`: Retry limit before marking outbox rows failed.
- `REINDEX_BATCH_SIZE`: Product batch size for reindex jobs.

## API Examples

Search products:

```bash
curl -X POST http://localhost:3000/api/search/products \
  -H "Content-Type: application/json" \
  -d '{
    "query": "wireless headphones",
    "page": 1,
    "pageSize": 20,
    "sort": "relevance",
    "filters": {
      "brandSlugs": ["sony"],
      "categorySlugs": ["audio"],
      "inStock": true,
      "minPriceCents": 5000,
      "maxPriceCents": 30000,
      "attributes": {
        "color": ["black"]
      }
    },
    "facets": ["brands", "categories", "tags", "priceRanges", "availability"]
  }'
```

Autocomplete:

```bash
curl -X POST http://localhost:3000/api/search/products/autocomplete \
  -H "Content-Type: application/json" \
  -d '{
    "query": "hea",
    "limit": 8,
    "inStock": true
  }'
```

Indexing webhook:

```bash
curl -X POST http://localhost:3000/webhooks/search/indexing \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "aggregateType": "product",
        "aggregateId": "6f9dce45-6093-44ff-bfd9-64bc217157d4",
        "operation": "UPSERT",
        "reason": "product-updated"
      }
    ]
  }'
```

Start a full reindex:

```bash
curl -X POST http://localhost:3000/webhooks/search/reindex/products \
  -H "Content-Type: application/json" \
  -d '{"mode": "full"}'
```

Start an incremental reindex:

```bash
curl -X POST http://localhost:3000/webhooks/search/reindex/products \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "incremental",
    "updatedSince": "2026-01-01T00:00:00.000Z"
  }'
```

Check reindex status:

```bash
curl http://localhost:3000/webhooks/search/reindex/products
```

## Search Features

- Full-text search across title, subtitle, description, brand, category, tags, variants, and normalized searchable text.
- Facets for brands, categories, tags, price ranges, and availability.
- Filters for brand, category, tag, stock state, price, rating, and flattened attributes.
- Sorting by relevance, price, newest, and rating.
- Pagination with total hit counts.
- Highlight snippets for text matches.
- Fuzzy matching fallback for typo tolerance.
- Autocomplete via `search_as_you_type`, edge n-grams, nested variants, and tag matching.
- Dense-vector mapping on `embedding` to support hybrid/vector search expansion.

## Indexing Strategy

The product index uses a versioned physical index (`products_v1`) behind the `products` alias. The mapping uses strict dynamic behavior, custom analyzers for product text and autocomplete, nested fields for tags and variants, flattened fields for flexible attributes, and a dense-vector field for embeddings.

Indexing paths:

- `POST /webhooks/search/indexing` accepts product `UPSERT` and `DELETE` events.
- RabbitMQ consumer can listen to `RABBITMQ_SEARCH_INDEX_QUEUE`.
- PostgreSQL outbox worker claims pending `SearchOutboxEvent` rows and retries failed events.
- Reindex endpoint scans products in stable ID order and bulk upserts documents.

## Operations

Health checks:

- `GET /health/live`: process liveness.
- `GET /health/ready`: verifies PostgreSQL, Elasticsearch, and Redis.

Monitoring:

- `GET /metrics`: Prometheus metrics with process defaults plus HTTP request counts and latency histograms.

Docs:

- `GET /docs`: Swagger UI.
- `GET /openapi.json`: OpenAPI document.

## Development

```bash
npm run build
npm run lint
npm test
```

Useful scripts:

- `npm run dev`: start the API with `tsx watch`.
- `npm run start`: run compiled JavaScript from `dist`.
- `npm run prisma:generate`: generate Prisma client.
- `npm run prisma:migrate`: run local Prisma migrations.
- `npm run search:setup-index`: create the Elasticsearch index if missing.

## Scaling Notes

- Use index aliases for zero-downtime schema migrations. Build a new versioned index, backfill it, then atomically swap the alias.
- Keep PostgreSQL as the source of truth and make Elasticsearch rebuildable from source records.
- Scale search API instances horizontally; cache invalidation uses Redis namespace versions and works across instances.
- Run outbox workers with care. For high throughput, add row-level claiming with `SKIP LOCKED` or partition work by aggregate ID.
- Increase Elasticsearch shard and replica counts per data size and availability targets.
- Use separate queues for high and low priority indexing events when product update volume grows.
- Track indexing lag, failed outbox events, search latency percentiles, cache hit rates, and Elasticsearch heap pressure.
- For production hybrid search, populate `embedding` from a dedicated embedding pipeline and combine vector scoring with keyword filters.
