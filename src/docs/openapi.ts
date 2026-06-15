export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Elasticsearch Search Service API',
    version: '0.1.0',
    description:
      'Production search service with full-text search, facets, autocomplete, indexing webhooks, and reindex operations.'
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development'
    }
  ],
  tags: [
    { name: 'Search' },
    { name: 'Indexing' },
    { name: 'Operations' },
    { name: 'Health' }
  ],
  paths: {
    '/api/search/products': {
      post: {
        tags: ['Search'],
        summary: 'Search products',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ProductSearchRequest'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Search results with facets and pagination'
          },
          '400': {
            $ref: '#/components/responses/BadRequest'
          }
        }
      }
    },
    '/api/search/products/autocomplete': {
      post: {
        tags: ['Search'],
        summary: 'Autocomplete product suggestions',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ProductAutocompleteRequest'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Autocomplete suggestions'
          },
          '400': {
            $ref: '#/components/responses/BadRequest'
          }
        }
      }
    },
    '/webhooks/search/indexing': {
      post: {
        tags: ['Indexing'],
        summary: 'Accept product indexing events',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/IndexingWebhookRequest'
              }
            }
          }
        },
        responses: {
          '202': {
            description: 'Indexing events accepted'
          },
          '400': {
            $ref: '#/components/responses/BadRequest'
          }
        }
      }
    },
    '/webhooks/search/reindex/products': {
      get: {
        tags: ['Operations'],
        summary: 'Get current product reindex job status',
        responses: {
          '200': {
            description: 'Current reindex job status'
          }
        }
      },
      post: {
        tags: ['Operations'],
        summary: 'Start a product reindex job',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ProductReindexRequest'
              }
            }
          }
        },
        responses: {
          '202': {
            description: 'Reindex job started or already running'
          },
          '400': {
            $ref: '#/components/responses/BadRequest'
          }
        }
      }
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: {
          '200': {
            description: 'Process is alive'
          }
        }
      }
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check for PostgreSQL, Elasticsearch, and Redis',
        responses: {
          '200': {
            description: 'Service dependencies are ready'
          },
          '503': {
            description: 'One or more dependencies are unavailable'
          }
        }
      }
    },
    '/metrics': {
      get: {
        tags: ['Operations'],
        summary: 'Prometheus metrics endpoint',
        responses: {
          '200': {
            description: 'Prometheus text metrics'
          }
        }
      }
    }
  },
  components: {
    responses: {
      BadRequest: {
        description: 'Validation error'
      }
    },
    schemas: {
      ProductSearchRequest: {
        type: 'object',
        properties: {
          query: { type: 'string', example: 'wireless headphones' },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          sort: {
            type: 'string',
            enum: ['relevance', 'price_asc', 'price_desc', 'newest', 'rating_desc'],
            default: 'relevance'
          },
          filters: {
            type: 'object',
            properties: {
              brandSlugs: {
                type: 'array',
                items: { type: 'string' }
              },
              categorySlugs: {
                type: 'array',
                items: { type: 'string' }
              },
              tagSlugs: {
                type: 'array',
                items: { type: 'string' }
              },
              inStock: { type: 'boolean' },
              minPriceCents: { type: 'integer', minimum: 0 },
              maxPriceCents: { type: 'integer', minimum: 0 },
              minRating: { type: 'number', minimum: 0, maximum: 5 },
              attributes: {
                type: 'object',
                additionalProperties: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          },
          facets: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['brands', 'categories', 'tags', 'priceRanges', 'availability']
            }
          }
        }
      },
      ProductAutocompleteRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 100 },
          limit: { type: 'integer', minimum: 1, maximum: 10, default: 8 },
          brandSlug: { type: 'string' },
          categorySlug: { type: 'string' },
          inStock: { type: 'boolean' }
        }
      },
      IndexingWebhookRequest: {
        type: 'object',
        required: ['events'],
        properties: {
          events: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              required: ['aggregateType', 'aggregateId', 'operation'],
              properties: {
                aggregateType: { type: 'string', enum: ['product'] },
                aggregateId: { type: 'string', format: 'uuid' },
                operation: { type: 'string', enum: ['UPSERT', 'DELETE'] },
                reason: { type: 'string' }
              }
            }
          }
        }
      },
      ProductReindexRequest: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['full', 'incremental'], default: 'full' },
          updatedSince: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
} as const;
