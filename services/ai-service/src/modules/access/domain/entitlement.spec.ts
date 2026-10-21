import { featureOf, isStale, supersedes, type PayerEntitlements } from './entitlement.js';

const snap = (version: number, validUntil: string, features: PayerEntitlements['features'] = {}): PayerEntitlements => ({
  features,
  periodStart: new Date('2026-10-21T00:00:00Z'),
  periodEnd: new Date('2026-11-21T00:00:00Z'),
  validUntil: new Date(validUntil),
  version,
});

describe('supersedes', () => {
  it('lets a higher version win whatever its validUntil', () => {
    expect(supersedes(snap(3, '2026-10-22T00:00:00Z'), snap(2, '2026-11-21T00:00:00Z'))).toBe(true);
    expect(supersedes(snap(2, '2026-11-21T00:00:00Z'), snap(3, '2026-10-22T00:00:00Z'))).toBe(false);
  });

  it('at one version, keeps the later validUntil — a fresh read beats the stale event', () => {
    expect(supersedes(snap(2, '2026-11-21T00:00:00Z'), snap(2, '2026-10-22T00:00:00Z'))).toBe(true);
    expect(supersedes(snap(2, '2026-10-22T00:00:00Z'), snap(2, '2026-11-21T00:00:00Z'))).toBe(false);
  });

  it('takes a redelivery of the same snapshot as a harmless rewrite', () => {
    expect(supersedes(snap(2, '2026-11-21T00:00:00Z'), snap(2, '2026-11-21T00:00:00Z'))).toBe(true);
  });
});

describe('isStale', () => {
  it('is stale from validUntil on', () => {
    const s = snap(1, '2026-10-22T00:00:00Z');
    expect(isStale(s, new Date('2026-10-21T23:59:59Z'))).toBe(false);
    expect(isStale(s, new Date('2026-10-22T00:00:00Z'))).toBe(true);
  });
});

describe('featureOf', () => {
  it('gives the feature with the snapshot period, and null for a key the tariff lacks', () => {
    const s = snap(1, '2026-11-21T00:00:00Z', {
      'ai.review_draft': { enabled: false, monthlyCredits: '100', limits: {} },
    });
    expect(featureOf(s, 'ai.review_draft')).toEqual({
      enabled: false,
      monthlyCredits: '100',
      limits: {},
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
    });
    expect(featureOf(s, 'ai.practice')).toBeNull();
  });
});
