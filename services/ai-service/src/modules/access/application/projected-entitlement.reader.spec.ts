import type { PayerEntitlements } from '../domain/entitlement.js';
import { supersedes } from '../domain/entitlement.js';
import type { BilledPayer, IEntitlementProjection } from './ports/entitlement-projection.js';
import type { ISubscriptionClient } from './ports/subscription.client.js';
import { ProjectedEntitlementReader } from './projected-entitlement.reader.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const payer = { type: 'workspace' as const, id: 'w1' };

const snap = (version: number, validUntil: string, enabled = true): PayerEntitlements => ({
  features: { 'ai.review_draft': { enabled, monthlyCredits: '500', limits: {} } },
  periodStart: new Date('2026-10-21T00:00:00Z'),
  periodEnd: new Date('2026-11-21T00:00:00Z'),
  validUntil: new Date(validUntil),
  version,
});

function setup(held: PayerEntitlements | null, remote: PayerEntitlements | Error) {
  let row = held;
  let fetches = 0;
  const projection: IEntitlementProjection = {
    get: async () => row,
    save: async (_p: BilledPayer, s: PayerEntitlements) => {
      if (row && !supersedes(s, row)) return false;
      row = s;
      return true;
    },
  };
  const client: ISubscriptionClient = {
    fetchEntitlements: async () => {
      fetches++;
      if (remote instanceof Error) throw remote;
      return remote;
    },
  };
  const reader = new ProjectedEntitlementReader(projection, client, () => NOW);
  return { reader, fetches: () => fetches, row: () => row };
}

describe('ProjectedEntitlementReader', () => {
  it('answers from a fresh row without calling subscription-service', async () => {
    const t = setup(snap(3, '2026-11-01T00:00:00Z', false), new Error('must not be called'));
    expect((await t.reader.getFeature(payer, 'ai.review_draft'))?.enabled).toBe(false);
    expect(t.fetches()).toBe(0);
  });

  it('reads through on a miss and stores the answer', async () => {
    const t = setup(null, snap(0, '2026-11-01T00:00:00Z'));
    expect((await t.reader.getFeature(payer, 'ai.review_draft'))?.monthlyCredits).toBe('500');
    expect(t.fetches()).toBe(1);
    expect(t.row()?.version).toBe(0);
  });

  it('reads through a stale row, and the fresh read of the same version replaces it', async () => {
    const t = setup(snap(2, '2026-10-21T11:00:00Z'), snap(2, '2026-11-21T00:00:00Z', false));
    expect((await t.reader.getFeature(payer, 'ai.review_draft'))?.enabled).toBe(false);
    expect(t.row()?.validUntil).toEqual(new Date('2026-11-21T00:00:00Z'));
  });

  it('keeps a newer row that landed during the read-through', async () => {
    const newer = snap(5, '2026-11-21T00:00:00Z', false);
    // An event wins the race between the fetch and the save.
    const client = { fetchEntitlements: async () => snap(1, '2026-11-21T00:00:00Z') };
    let row: PayerEntitlements | null = null;
    const projection: IEntitlementProjection = {
      get: async () => row,
      save: async () => {
        row = newer;
        return false;
      },
    };
    const reader = new ProjectedEntitlementReader(projection, client, () => NOW);
    expect((await reader.getFeature(payer, 'ai.review_draft'))?.enabled).toBe(false);
  });

  it('throws when the row is missing and subscription-service cannot be read — the gate refuses', async () => {
    const t = setup(null, new Error('ECONNREFUSED'));
    await expect(t.reader.getFeature(payer, 'ai.review_draft')).rejects.toThrow('ECONNREFUSED');
  });

  it('gives null for a key the tariff lacks, and for the platform', async () => {
    const t = setup(snap(1, '2026-11-01T00:00:00Z'), new Error('must not be called'));
    expect(await t.reader.getFeature(payer, 'ai.practice')).toBeNull();
    expect(await t.reader.getFeature({ type: 'platform', id: 'platform' }, 'ai.review_draft')).toBeNull();
  });
});
