require('reflect-metadata');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/search_service?schema=public';
process.env.ENABLE_SEARCH_CACHE = 'false';
process.env.ENABLE_OUTBOX_WORKER = 'false';
