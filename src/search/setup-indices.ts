import { pathToFileURL } from 'node:url';
import { elasticsearch } from '../infra/elasticsearch.js';
import { logger } from '../config/logger.js';
import {
  PRODUCT_INDEX_ALIAS,
  PRODUCT_INDEX_NAME,
  productIndexDefinition
} from './product-index.js';

export async function setupProductIndex(): Promise<void> {
  const exists = await elasticsearch.indices.exists({
    index: PRODUCT_INDEX_NAME
  });

  if (exists) {
    logger.info('Elasticsearch product index already exists', {
      index: PRODUCT_INDEX_NAME
    });
    return;
  }

  await elasticsearch.indices.create(productIndexDefinition);

  logger.info('Created Elasticsearch product index', {
    index: PRODUCT_INDEX_NAME,
    alias: PRODUCT_INDEX_ALIAS
  });
}

const entrypoint = process.argv[1];

if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  setupProductIndex()
    .then(() => {
      logger.info('Elasticsearch index setup complete');
    })
    .catch((error: unknown) => {
      logger.error('Elasticsearch index setup failed', { error });
      process.exitCode = 1;
    });
}
