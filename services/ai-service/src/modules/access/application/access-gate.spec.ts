import type { FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import type { PayerPolicy, StoredPayerPolicy } from '../domain/payer-policy.js';
import { AccessGate } from './access-gate.js';

const SCHOOL: Payer = { type: 'workspace', id: 'w1' };

const feature = (over: Partial<FeatureEntitlement> = {}): FeatureEntitlement => ({
  enabled: true,
  monthlyCredits: null,
  limits: {},
  periodStart: new Date('2026-10-01T00:00:00Z'),
  periodEnd: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

function setup(opts: { policy?: PayerPolicy | null; feature?: FeatureEntitlement | null; policyFails?: boolean; tariffFails?: boolean }) {
  const asked: string[] = [];
  const gate = new AccessGate(
    {
      get: async () => {
        if (opts.policyFails) throw new Error('db down');
        return opts.policy ? ({ ...opts.policy } as StoredPayerPolicy) : null;
      },
      save: async () => {
        throw new Error('unused');
      },
    },
    {
      getFeature: async (_payer, key) => {
        asked.push(key);
        if (opts.tariffFails) throw new Error('down');
        return opts.feature === undefined ? feature() : opts.feature;
      },
    },
  );
  return { gate, asked };
}

describe('AccessGate', () => {
  it('lets the platform through without reading any policy or tariff', async () => {
    const { gate, asked } = setup({ policyFails: true, tariffFails: true });
    const decision = await gate.check('diagnostic', { type: 'platform', id: 'platform' });
    expect(decision.isOk).toBe(true);
    expect(decision.value).toEqual({ allowedRegions: null, feature: null });
    expect(asked).toEqual([]);
  });

  it('grants a payer without a stored policy any region, under the agent’s feature key', async () => {
    const { gate, asked } = setup({ policy: null });
    const decision = await gate.check('review_draft', SCHOOL);
    expect(decision.value.allowedRegions).toBeNull();
    expect(decision.value.feature?.enabled).toBe(true);
    expect(asked).toEqual(['ai.review_draft']);
  });

  it('passes the payer’s regions on to the router', async () => {
    const { gate } = setup({ policy: { aiEnabled: true, allowedRegions: ['eu', 'local'] } });
    expect((await gate.check('diagnostic', SCHOOL)).value.allowedRegions).toEqual(['eu', 'local']);
  });

  it('refuses by policy when the payer switched AI off — before asking the tariff', async () => {
    const { gate, asked } = setup({ policy: { aiEnabled: false, allowedRegions: null } });
    const decision = await gate.check('diagnostic', SCHOOL);
    expect(decision.error).toEqual({ kind: 'refused', code: 'ai_disabled' });
    expect(asked).toEqual([]);
  });

  it.each([
    ['not in the tariff', null],
    ['switched off in the tariff', feature({ enabled: false })],
  ])('refuses as not entitled when the agent is %s', async (_label, f) => {
    const { gate } = setup({ feature: f });
    expect((await gate.check('diagnostic', SCHOOL)).error).toEqual({ kind: 'refused', code: 'not_entitled' });
  });

  it.each([
    ['the policy', { policyFails: true }],
    ['the tariff', { tariffFails: true }],
  ])('fails closed when %s cannot be read', async (_label, opts) => {
    const { gate } = setup(opts);
    expect((await gate.check('diagnostic', SCHOOL)).error).toEqual({ kind: 'gate_unavailable' });
  });
});
