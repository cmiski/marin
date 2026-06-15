import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';

const credentials =
  env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD
    ? {
        username: env.ELASTICSEARCH_USERNAME,
        password: env.ELASTICSEARCH_PASSWORD
      }
    : undefined;

export const elasticsearch = new Client({
  node: env.ELASTICSEARCH_NODE,
  auth: credentials
});
