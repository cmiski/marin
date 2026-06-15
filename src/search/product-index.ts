import type { estypes } from '@elastic/elasticsearch';

export const PRODUCT_INDEX_ALIAS = 'products';
export const PRODUCT_INDEX_VERSION = 1;
export const PRODUCT_INDEX_NAME = `${PRODUCT_INDEX_ALIAS}_v${String(PRODUCT_INDEX_VERSION)}`;
export const PRODUCT_EMBEDDING_DIMENSIONS = 384;

const textAnalyzer = 'product_text';
const autocompleteAnalyzer = 'product_autocomplete';
const autocompleteSearchAnalyzer = 'product_autocomplete_search';

const keywordIgnoreAbove = 256;

const nestedTagMapping: estypes.MappingProperty = {
  type: 'nested',
  properties: {
    id: { type: 'keyword' },
    name: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword', ignore_above: keywordIgnoreAbove }
      }
    },
    slug: { type: 'keyword' }
  }
};

const productVariantMapping: estypes.MappingProperty = {
  type: 'nested',
  properties: {
    id: { type: 'keyword' },
    sku: { type: 'keyword' },
    title: {
      type: 'text',
      analyzer: textAnalyzer,
      fields: {
        keyword: { type: 'keyword', ignore_above: keywordIgnoreAbove },
        suggest: {
          type: 'search_as_you_type'
        }
      }
    },
    priceCents: { type: 'integer' },
    inventoryCount: { type: 'integer' },
    attributes: {
      type: 'flattened'
    }
  }
};

export const productIndexDefinition = {
  index: PRODUCT_INDEX_NAME,
  aliases: {
    [PRODUCT_INDEX_ALIAS]: {
      is_write_index: true
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      filter: {
        autocomplete_edge_ngram: {
          type: 'edge_ngram',
          min_gram: 2,
          max_gram: 20
        },
        english_stop: {
          type: 'stop',
          stopwords: '_english_'
        },
        english_stemmer: {
          type: 'stemmer',
          language: 'english'
        }
      },
      analyzer: {
        [textAnalyzer]: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'english_stop', 'english_stemmer']
        },
        [autocompleteAnalyzer]: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'autocomplete_edge_ngram']
        },
        [autocompleteSearchAnalyzer]: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding']
        }
      },
      normalizer: {
        lowercase_keyword: {
          type: 'custom',
          filter: ['lowercase', 'asciifolding']
        }
      }
    }
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      id: { type: 'keyword' },
      sku: { type: 'keyword' },
      slug: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: textAnalyzer,
        fields: {
          keyword: { type: 'keyword', ignore_above: keywordIgnoreAbove },
          autocomplete: {
            type: 'text',
            analyzer: autocompleteAnalyzer,
            search_analyzer: autocompleteSearchAnalyzer
          },
          suggest: {
            type: 'search_as_you_type'
          }
        }
      },
      subtitle: {
        type: 'text',
        analyzer: textAnalyzer,
        fields: {
          keyword: { type: 'keyword', ignore_above: keywordIgnoreAbove }
        }
      },
      description: {
        type: 'text',
        analyzer: textAnalyzer
      },
      searchableText: {
        type: 'text',
        analyzer: textAnalyzer
      },
      status: { type: 'keyword' },
      priceCents: { type: 'integer' },
      currency: { type: 'keyword' },
      inventoryCount: { type: 'integer' },
      inStock: { type: 'boolean' },
      ratingAverage: { type: 'scaled_float', scaling_factor: 100 },
      ratingCount: { type: 'integer' },
      brand: {
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            fields: {
              keyword: {
                type: 'keyword',
                ignore_above: keywordIgnoreAbove,
                normalizer: 'lowercase_keyword'
              }
            }
          },
          slug: { type: 'keyword' }
        }
      },
      category: {
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            fields: {
              keyword: {
                type: 'keyword',
                ignore_above: keywordIgnoreAbove,
                normalizer: 'lowercase_keyword'
              }
            }
          },
          slug: { type: 'keyword' },
          path: { type: 'keyword' }
        }
      },
      tags: nestedTagMapping,
      variants: productVariantMapping,
      attributes: {
        type: 'flattened'
      },
      embedding: {
        type: 'dense_vector',
        dims: PRODUCT_EMBEDDING_DIMENSIONS,
        index: true,
        similarity: 'cosine'
      },
      publishedAt: { type: 'date' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' }
    }
  }
} satisfies estypes.IndicesCreateRequest;

export const activeProductFilter: estypes.QueryDslQueryContainer = {
  bool: {
    filter: [
      { term: { status: 'ACTIVE' } },
      { exists: { field: 'publishedAt' } }
    ]
  }
};
