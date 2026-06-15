import { describe, expect, it } from '@jest/globals';
import { AppError } from '../middleware/error-handler.js';
import { parseProductSearchRequest } from './product-search-request.js';

describe('parseProductSearchRequest', () => {
  it('applies defaults and deduplicates filters', () => {
    const request = parseProductSearchRequest({
      query: ' headphones ',
      filters: {
        brandSlugs: ['sony', 'sony'],
        attributes: {
          color: ['black', 'black', 'blue']
        }
      }
    });

    expect(request).toMatchObject({
      query: 'headphones',
      page: 1,
      pageSize: 20,
      sort: 'relevance',
      filters: {
        brandSlugs: ['sony'],
        attributes: {
          color: ['black', 'blue']
        }
      },
      facets: ['brands', 'categories', 'tags', 'priceRanges', 'availability']
    });
  });

  it('rejects an inverted price range', () => {
    expect(() =>
      parseProductSearchRequest({
        filters: {
          minPriceCents: 5000,
          maxPriceCents: 1000
        }
      })
    ).toThrow(AppError);
  });
});
