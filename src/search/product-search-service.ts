import type { estypes } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import { elasticsearch } from '../infra/elasticsearch.js';
import { PRODUCT_INDEX_ALIAS } from './product-index.js';
import type { ProductSearchDocument } from './product-document.js';
import type { ProductSearchRequest } from './product-search-request.js';
import { getCachedValue, productSearchCacheNamespace } from './search-cache.js';

type SearchFacetEntry = {
  key: string;
  label: string;
  count: number;
};

type PriceRangeFacetEntry = {
  key: string;
  count: number;
  from: number | null;
  to: number | null;
};

type SearchResponseItem = ProductSearchDocument & {
  score: number;
  highlights: string[];
};

export type ProductSearchResponse = {
  query: string | null;
  sort: ProductSearchRequest['sort'];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  results: SearchResponseItem[];
  facets: {
    brands: SearchFacetEntry[];
    categories: SearchFacetEntry[];
    tags: SearchFacetEntry[];
    priceRanges: PriceRangeFacetEntry[];
    availability: SearchFacetEntry[];
  };
};

export class ProductSearchService {
  public async searchProducts(
    request: ProductSearchRequest
  ): Promise<ProductSearchResponse> {
    return getCachedValue({
      namespace: productSearchCacheNamespace,
      ttlSeconds: env.SEARCH_CACHE_TTL_SECONDS,
      keyPayload: {
        type: 'search',
        request
      },
      loader: async () => {
        const response = await elasticsearch.search<ProductSearchDocument>({
          index: PRODUCT_INDEX_ALIAS,
          from: (request.page - 1) * request.pageSize,
          size: request.pageSize,
          track_total_hits: true,
          query: buildSearchQuery(request),
          sort: buildSort(request),
          aggs: buildAggregations(request),
          highlight:
            request.query === undefined
              ? undefined
              : {
                  pre_tags: ['<em>'],
                  post_tags: ['</em>'],
                  fields: {
                    title: {},
                    subtitle: {},
                    description: {
                      fragment_size: 140,
                      number_of_fragments: 1
                    },
                    searchableText: {
                      fragment_size: 140,
                      number_of_fragments: 1
                    }
                  }
                }
        });

        const total = extractTotal(response.hits.total);
        const results = response.hits.hits.flatMap((hit) => {
          if (hit._source === undefined) {
            return [];
          }

          return [
            {
              ...hit._source,
              score: hit._score ?? 0,
              highlights: flattenHighlights(hit.highlight)
            }
          ];
        });

        return {
          query: request.query ?? null,
          sort: request.sort,
          pagination: {
            page: request.page,
            pageSize: request.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / request.pageSize))
          },
          results,
          facets: {
            brands: parseLabeledTermsFacet(response.aggregations, 'brands', 'label'),
            categories: parseLabeledTermsFacet(response.aggregations, 'categories', 'label'),
            tags: parseNestedLabeledTermsFacet(response.aggregations, 'tags', 'items', 'label'),
            priceRanges: parsePriceRangesFacet(response.aggregations, 'priceRanges'),
            availability: parseAvailabilityFacet(response.aggregations, 'availability')
          }
        };
      }
    });
  }
}

export const productSearchService = new ProductSearchService();

function buildSearchQuery(request: ProductSearchRequest): estypes.QueryDslQueryContainer {
  const filters = buildFilters(request);
  const baseQuery =
    request.query === undefined
      ? ({ bool: { filter: filters } } satisfies estypes.QueryDslQueryContainer)
      : ({
          function_score: {
            boost_mode: 'sum',
            score_mode: 'sum',
            query: {
              bool: {
                filter: filters,
                must: [
                  {
                    bool: {
                      should: [
                        {
                          multi_match: {
                            query: request.query,
                            type: 'best_fields',
                            fields: [
                              'title^8',
                              'subtitle^4',
                              'searchableText^4',
                              'brand.name^3',
                              'category.name^2',
                              'description^1.5'
                            ],
                            operator: 'and',
                            minimum_should_match: '75%'
                          }
                        },
                        {
                          match_phrase: {
                            title: {
                              query: request.query,
                              boost: 10
                            }
                          }
                        },
                        {
                          match_phrase: {
                            'brand.name': {
                              query: request.query,
                              boost: 3
                            }
                          }
                        },
                        {
                          nested: {
                            path: 'variants',
                            score_mode: 'max',
                            query: {
                              match: {
                                'variants.title': {
                                  query: request.query,
                                  boost: 2
                                }
                              }
                            }
                          }
                        },
                        {
                          nested: {
                            path: 'tags',
                            score_mode: 'max',
                            query: {
                              match: {
                                'tags.name': {
                                  query: request.query,
                                  boost: 2
                                }
                              }
                            }
                          }
                        },
                        {
                          multi_match: {
                            query: request.query,
                            fields: [
                              'title^5',
                              'subtitle^2',
                              'searchableText^2',
                              'brand.name^2',
                              'category.name^1.5',
                              'description'
                            ],
                            fuzziness: 'AUTO',
                            prefix_length: 1,
                            max_expansions: 20,
                            boost: 1.5
                          }
                        }
                      ],
                      minimum_should_match: 1
                    }
                  }
                ]
              }
            },
            functions: [
              {
                filter: {
                  term: {
                    inStock: true
                  }
                },
                weight: 1.5
              },
              {
                field_value_factor: {
                  field: 'ratingAverage',
                  factor: 0.25,
                  modifier: 'sqrt',
                  missing: 0
                }
              },
              {
                gauss: {
                  publishedAt: {
                    origin: 'now',
                    scale: '21d',
                    offset: '7d',
                    decay: 0.5
                  }
                },
                weight: 1.1
              }
            ]
          }
        } satisfies estypes.QueryDslQueryContainer);

  return baseQuery;
}

function buildFilters(
  request: ProductSearchRequest
): estypes.QueryDslQueryContainer[] {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { status: 'ACTIVE' } },
    { exists: { field: 'publishedAt' } }
  ];

  if (request.filters.brandSlugs.length > 0) {
    filters.push({
      terms: {
        'brand.slug': request.filters.brandSlugs
      }
    });
  }

  if (request.filters.categorySlugs.length > 0) {
    filters.push({
      terms: {
        'category.slug': request.filters.categorySlugs
      }
    });
  }

  if (request.filters.tagSlugs.length > 0) {
    filters.push({
      nested: {
        path: 'tags',
        query: {
          terms: {
            'tags.slug': request.filters.tagSlugs
          }
        }
      }
    });
  }

  if (request.filters.inStock !== undefined) {
    filters.push({
      term: {
        inStock: request.filters.inStock
      }
    });
  }

  if (
    request.filters.minPriceCents !== undefined ||
    request.filters.maxPriceCents !== undefined
  ) {
    filters.push({
      range: {
        priceCents: {
          gte: request.filters.minPriceCents,
          lte: request.filters.maxPriceCents
        }
      }
    });
  }

  if (request.filters.minRating !== undefined) {
    filters.push({
      range: {
        ratingAverage: {
          gte: request.filters.minRating
        }
      }
    });
  }

  for (const [key, values] of Object.entries(request.filters.attributes)) {
    if (values.length === 1) {
      filters.push({
        term: {
          [`attributes.${key}`]: values[0]
        }
      });
      continue;
    }

    filters.push({
      terms: {
        [`attributes.${key}`]: values
      }
    });
  }

  return filters;
}

function buildSort(request: ProductSearchRequest): estypes.SortCombinations[] {
  switch (request.sort) {
    case 'price_asc':
      return [{ priceCents: { order: 'asc' } }, { _score: { order: 'desc' } }];
    case 'price_desc':
      return [{ priceCents: { order: 'desc' } }, { _score: { order: 'desc' } }];
    case 'newest':
      return [{ publishedAt: { order: 'desc' } }, { _score: { order: 'desc' } }];
    case 'rating_desc':
      return [
        { ratingAverage: { order: 'desc' } },
        { ratingCount: { order: 'desc' } },
        { _score: { order: 'desc' } }
      ];
    case 'relevance':
    default:
      return request.query === undefined
        ? [{ publishedAt: { order: 'desc' } }, { ratingAverage: { order: 'desc' } }]
        : [{ _score: { order: 'desc' } }, { ratingAverage: { order: 'desc' } }];
  }
}

function buildAggregations(
  request: ProductSearchRequest
): Record<string, estypes.AggregationsAggregationContainer> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> = {};

  if (request.facets.includes('brands')) {
    aggregations.brands = {
      terms: {
        field: 'brand.slug',
        size: 20
      },
      aggs: {
        label: {
          terms: {
            field: 'brand.name.keyword',
            size: 1
          }
        }
      }
    };
  }

  if (request.facets.includes('categories')) {
    aggregations.categories = {
      terms: {
        field: 'category.slug',
        size: 20
      },
      aggs: {
        label: {
          terms: {
            field: 'category.name.keyword',
            size: 1
          }
        }
      }
    };
  }

  if (request.facets.includes('tags')) {
    aggregations.tags = {
      nested: {
        path: 'tags'
      },
      aggs: {
        items: {
          terms: {
            field: 'tags.slug',
            size: 20
          },
          aggs: {
            label: {
              terms: {
                field: 'tags.name.keyword',
                size: 1
              }
            }
          }
        }
      }
    };
  }

  if (request.facets.includes('priceRanges')) {
    aggregations.priceRanges = {
      range: {
        field: 'priceCents',
        ranges: [
          { key: 'under_25', to: 2500 },
          { key: '25_to_50', from: 2500, to: 5000 },
          { key: '50_to_100', from: 5000, to: 10000 },
          { key: '100_plus', from: 10000 }
        ]
      }
    };
  }

  if (request.facets.includes('availability')) {
    aggregations.availability = {
      terms: {
        field: 'inStock',
        size: 2
      }
    };
  }

  return aggregations;
}

function extractTotal(total: estypes.SearchTotalHits | number | undefined): number {
  if (typeof total === 'number') {
    return total;
  }

  return total?.value ?? 0;
}

function flattenHighlights(
  highlight: Record<string, string[]> | undefined
): string[] {
  if (highlight === undefined) {
    return [];
  }

  return Object.values(highlight).flatMap((entries) => entries);
}

function parseLabeledTermsFacet(
  aggregations: unknown,
  aggregationName: string,
  labelAggregationName: string
): SearchFacetEntry[] {
  const aggregationRecord = asRecord(aggregations);
  const buckets = readBuckets(aggregationRecord?.[aggregationName]);

  return buckets
    .map((bucket) => {
      const key = readKey(bucket);

      if (key === null) {
        return null;
      }

      const labelBuckets = readBuckets(bucket[labelAggregationName]);
      const label = readKey(labelBuckets[0]) ?? key;

      return {
        key,
        label,
        count: readDocCount(bucket)
      };
    })
    .filter((entry): entry is SearchFacetEntry => entry !== null);
}

function parseNestedLabeledTermsFacet(
  aggregations: unknown,
  nestedAggregationName: string,
  itemsAggregationName: string,
  labelAggregationName: string
): SearchFacetEntry[] {
  const aggregationRecord = asRecord(aggregations);
  const nestedAggregation = asRecord(aggregationRecord?.[nestedAggregationName]);
  const buckets = readBuckets(nestedAggregation?.[itemsAggregationName]);

  return buckets
    .map((bucket) => {
      const key = readKey(bucket);

      if (key === null) {
        return null;
      }

      const labelBuckets = readBuckets(bucket[labelAggregationName]);
      const label = readKey(labelBuckets[0]) ?? key;

      return {
        key,
        label,
        count: readDocCount(bucket)
      };
    })
    .filter((entry): entry is SearchFacetEntry => entry !== null);
}

function parsePriceRangesFacet(
  aggregations: unknown,
  aggregationName: string
): PriceRangeFacetEntry[] {
  const aggregationRecord = asRecord(aggregations);
  const buckets = readBuckets(aggregationRecord?.[aggregationName]);

  return buckets
    .map((bucket) => {
      const key = readKey(bucket);

      if (key === null) {
        return null;
      }

      return {
        key,
        count: readDocCount(bucket),
        from: readNullableNumber(bucket.from),
        to: readNullableNumber(bucket.to)
      };
    })
    .filter((entry): entry is PriceRangeFacetEntry => entry !== null);
}

function parseAvailabilityFacet(
  aggregations: unknown,
  aggregationName: string
): SearchFacetEntry[] {
  const aggregationRecord = asRecord(aggregations);
  const buckets = readBuckets(aggregationRecord?.[aggregationName]);

  return buckets
    .map((bucket) => {
      const rawKey = readRawKey(bucket);

      if (typeof rawKey !== 'boolean') {
        return null;
      }

      return {
        key: rawKey ? 'in_stock' : 'out_of_stock',
        label: rawKey ? 'In stock' : 'Out of stock',
        count: readDocCount(bucket)
      };
    })
    .filter((entry): entry is SearchFacetEntry => entry !== null);
}

function readBuckets(value: unknown): Array<Record<string, unknown>> {
  const record = asRecord(value);

  if (record === undefined) {
    return [];
  }

  const buckets = record.buckets;

  if (!Array.isArray(buckets)) {
    return [];
  }

  return buckets.filter((bucket): bucket is Record<string, unknown> => asRecord(bucket) !== undefined);
}

function readDocCount(bucket: Record<string, unknown>): number {
  return typeof bucket.doc_count === 'number' ? bucket.doc_count : 0;
}

function readKey(bucket: Record<string, unknown> | undefined): string | null {
  const rawKey = readRawKey(bucket);

  if (typeof rawKey === 'string' || typeof rawKey === 'number') {
    return String(rawKey);
  }

  return null;
}

function readRawKey(
  bucket: Record<string, unknown> | undefined
): string | number | boolean | null {
  if (bucket === undefined) {
    return null;
  }

  const rawKey = bucket.key;

  if (
    typeof rawKey === 'string' ||
    typeof rawKey === 'number' ||
    typeof rawKey === 'boolean'
  ) {
    return rawKey;
  }

  return null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
