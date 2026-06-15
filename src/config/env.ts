import 'dotenv/config';
import { z } from 'zod';

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
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672')
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
