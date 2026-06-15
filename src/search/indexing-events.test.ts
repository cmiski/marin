import { describe, expect, it } from '@jest/globals';
import { parseIndexingWebhookPayload } from './indexing-events.js';

describe('parseIndexingWebhookPayload', () => {
  it('accepts product indexing events', () => {
    const events = parseIndexingWebhookPayload({
      events: [
        {
          aggregateType: 'product',
          aggregateId: '6f9dce45-6093-44ff-bfd9-64bc217157d4',
          operation: 'UPSERT',
          reason: 'product-updated'
        }
      ]
    });

    expect(events).toEqual([
      {
        aggregateType: 'product',
        aggregateId: '6f9dce45-6093-44ff-bfd9-64bc217157d4',
        operation: 'UPSERT',
        reason: 'product-updated'
      }
    ]);
  });

  it('rejects unsupported aggregate types', () => {
    expect(() =>
      parseIndexingWebhookPayload({
        events: [
          {
            aggregateType: 'order',
            aggregateId: '6f9dce45-6093-44ff-bfd9-64bc217157d4',
            operation: 'UPSERT'
          }
        ]
      })
    ).toThrow();
  });
});
