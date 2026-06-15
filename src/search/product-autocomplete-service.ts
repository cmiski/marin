import type { estypes } from '@elastic/elasticsearch';
import { elasticsearch } from '../infra/elasticsearch.js';
import { env } from '../config/env.js';
import { PRODUCT_INDEX_ALIAS } from './product-index.js';
import type { ProductSearchDocument } from './product-document.js';
import type { ProductAutocompleteRequest } from './product-autocomplete-request.js';
import { getCachedValue, productSearchCacheNamespace } from './search-cache.js';

export type ProductAutocompleteResponse = {
  query: string;
  suggestions: Array<{
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    brandName: string | null;
    categoryName: string | null;
    inStock: boolean;
    score: number;
  }>;
};

export class ProductAutocompleteService {
  public async autocompleteProducts(
    request: ProductAutocompleteRequest
  ): Promise<ProductAutocompleteResponse> {
    return getCachedValue({
      namespace: productSearchCacheNamespace,
      ttlSeconds: env.AUTOCOMPLETE_CACHE_TTL_SECONDS,
      keyPayload: {
        type: 'autocomplete',
        request
      },
      loader: async () => {
        const response = await elasticsearch.search<ProductSearchDocument>({
          index: PRODUCT_INDEX_ALIAS,
          size: request.limit,
          track_total_hits: false,
          query: buildAutocompleteQuery(request),
          sort: [{ _score: { order: 'desc' } }, { ratingAverage: { order: 'desc' } }],
          _source: [
            'id',
            'slug',
            'title',
            'subtitle',
            'brand',
            'category',
            'inStock'
          ]
        });

        const deduped = new Map<
          string,
          ProductAutocompleteResponse['suggestions'][number]
        >();

        for (const hit of response.hits.hits) {
          const source = hit._source;

          if (source === undefined || deduped.has(source.id)) {
            continue;
          }

          deduped.set(source.id, {
            id: source.id,
            slug: source.slug,
            title: source.title,
            subtitle: source.subtitle,
            brandName: source.brand?.name ?? null,
            categoryName: source.category?.name ?? null,
            inStock: source.inStock,
            score: hit._score ?? 0
          });
        }

        return {
          query: request.query,
          suggestions: [...deduped.values()]
        };
      }
    });
  }
}

export const productAutocompleteService = new ProductAutocompleteService();

function buildAutocompleteQuery(
  request: ProductAutocompleteRequest
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: buildAutocompleteFilters(request),
      should: [
        {
          multi_match: {
            query: request.query,
            type: 'bool_prefix',
            fields: [
              'title.suggest^8',
              'title.suggest._2gram^6',
              'title.suggest._3gram^4',
              'subtitle^2'
            ]
          }
        },
        {
          multi_match: {
            query: request.query,
            fields: ['title.autocomplete^6', 'searchableText^2', 'brand.name^2'],
            fuzziness: 'AUTO',
            prefix_length: 1,
            max_expansions: 20,
            boost: 2
          }
        },
        {
          nested: {
            path: 'variants',
            score_mode: 'max',
            query: {
              multi_match: {
                query: request.query,
                type: 'bool_prefix',
                fields: [
                  'variants.title.suggest^3',
                  'variants.title.suggest._2gram^2',
                  'variants.title.suggest._3gram'
                ]
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
                  fuzziness: 'AUTO',
                  prefix_length: 1,
                  boost: 1.5
                }
              }
            }
          }
        }
      ],
      minimum_should_match: 1
    }
  };
}

function buildAutocompleteFilters(
  request: ProductAutocompleteRequest
): estypes.QueryDslQueryContainer[] {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { status: 'ACTIVE' } },
    { exists: { field: 'publishedAt' } }
  ];

  if (request.brandSlug !== undefined) {
    filters.push({
      term: {
        'brand.slug': request.brandSlug
      }
    });
  }

  if (request.categorySlug !== undefined) {
    filters.push({
      term: {
        'category.slug': request.categorySlug
      }
    });
  }

  if (request.inStock !== undefined) {
    filters.push({
      term: {
        inStock: request.inStock
      }
    });
  }

  return filters;
}
