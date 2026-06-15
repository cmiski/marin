import { describe, expect, it } from '@jest/globals';
import { parseProductAutocompleteRequest } from './product-autocomplete-request.js';

describe('parseProductAutocompleteRequest', () => {
  it('normalizes valid autocomplete requests', () => {
    expect(
      parseProductAutocompleteRequest({
        query: ' pho ',
        brandSlug: 'sony'
      })
    ).toEqual({
      query: 'pho',
      limit: 8,
      brandSlug: 'sony'
    });
  });

  it('rejects empty queries', () => {
    expect(() =>
      parseProductAutocompleteRequest({
        query: '   '
      })
    ).toThrow();
  });
});
