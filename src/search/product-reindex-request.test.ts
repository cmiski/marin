import { describe, expect, it } from '@jest/globals';
import { AppError } from '../middleware/error-handler.js';
import { parseProductReindexRequest } from './product-reindex-request.js';

describe('parseProductReindexRequest', () => {
  it('defaults to a full reindex', () => {
    expect(parseProductReindexRequest({})).toEqual({
      mode: 'full'
    });
  });

  it('requires updatedSince for incremental reindexing', () => {
    expect(() =>
      parseProductReindexRequest({
        mode: 'incremental'
      })
    ).toThrow(AppError);
  });
});
