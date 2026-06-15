# Elasticsearch Search Service

Production-grade Node.js and TypeScript search service backed by PostgreSQL, Prisma, Elasticsearch, and Redis.

## Local Infrastructure

```bash
docker compose up -d postgres redis elasticsearch kibana
```

Services:

- API: `http://localhost:3000`
- Elasticsearch: `http://localhost:9200`
- Kibana: `http://localhost:5601`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Application features, data models, indexing, search APIs, documentation, and tests are added across the planned commit sequence.
