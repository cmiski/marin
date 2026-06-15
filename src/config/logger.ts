import winston from 'winston';
import { env } from './env.js';

const isProduction = env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: {
    service: 'elasticsearch-search-service'
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction ? winston.format.json() : winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});
