import { fromWire } from './entitlements-wire.mapper.js';

const wire = (over: Record<string, unknown> = {}) => ({
  account: { type: 'workspace', externalId: 'w1' },
  source: 'subscription',
  features: {
    'ai.review_draft': { enabled: true, monthlyCredits: '500', limits: { perLearnerCredits: 50 } },
    'ai.review_direct': { enabled: true, monthlyCredits: null, limits: {} },
  },
  periodStart: '2026-10-21T00:00:00.000Z',
  periodEnd: '2026-11-21T00:00:00.000Z',
  validUntil: '2026-11-20T00:00:00.000Z',
  version: 4,
  ...over,
});

describe('fromWire', () => {
  it('reads an event payload or an internal-API body', () => {
    const s = fromWire(wire());
    expect(s.version).toBe(4);
    expect(s.validUntil).toEqual(new Date('2026-11-20T00:00:00Z'));
    expect(s.features['ai.review_direct']).toEqual({ enabled: true, monthlyCredits: null, limits: {} });
    expect(s.features['ai.review_draft']!.limits).toEqual({ perLearnerCredits: 50 });
  });

  it.each([
    ['a missing version', { version: undefined }],
    ['a fractional version', { version: 1.5 }],
    ['features as a list', { features: [] }],
    ['a feature without enabled', { features: { 'ai.practice': { monthlyCredits: null, limits: {} } } }],
    ['credits as a number', { features: { 'ai.practice': { enabled: true, monthlyCredits: 5, limits: {} } } }],
    ['an unparsable date', { validUntil: 'soon' }],
  ])('refuses %s', (_name, over) => {
    expect(() => fromWire(wire(over))).toThrow(/entitlements:/);
  });
});
