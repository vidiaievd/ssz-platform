import type { QuotaKey } from '../domain/quota.js';
import { keyOf, parseKey } from './redis-quota-counter.js';

const KEY: QuotaKey = {
  payer: { type: 'workspace', id: '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60' },
  capability: 'review_draft',
  periodStart: new Date('2026-10-01T00:00:00Z'),
  periodEnd: new Date('2026-11-01T00:00:00Z'),
};

describe('quota counter keys', () => {
  it('round-trips a key, period bounds included', () => {
    expect(parseKey(keyOf(KEY))).toEqual(KEY);
  });

  it.each(['quota:lock:reconcile', 'ledger:spool', 'quota:platform:platform:diagnostic:1:2', 'quota:user:u:cap:x:2'])(
    'is not a counter: %s',
    (raw) => expect(parseKey(raw)).toBeNull(),
  );
});
