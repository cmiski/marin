import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
  DATABASE_URL: z.string().url(),
  ELASTICSEARCH_NODE: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_SEARCH_INDEX_QUEUE: z.string().default('search.index.events'),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(25),
  ENABLE_RABBITMQ_CONSUMER: booleanFromString.default(false),
  ENABLE_SEARCH_CACHE: booleanFromString.default(true),
  SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  AUTOCOMPLETE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120)
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
