import { Logger } from '@nestjs/common';
import type { ILedgerUsageReader } from '../../../../ledger/application/ports/ledger-usage.reader.js';
import { AI_FEATURE_KEYS, type FeatureEntitlement } from '../../../domain/entitlement.js';
import type { StoredPayerPolicy } from '../../../domain/payer-policy.js';
import { FeatureUsage } from '../../feature-usage.js';
import type { IEntitlementReader } from '../../ports/entitlement.reader.js';
import type { IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import type { IQuotaCounter } from '../../ports/quota-counter.js';
import { GetPayerUsageHandler } from './get-payer-usage.handler.js';
import { GetPayerUsageQuery } from './get-payer-usage.query.js';

const SCHOOL = '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60';
const START = new Date('2026-11-01T00:00:00.000Z');
const END = new Date('2026-12-01T00:00:00.000Z');
const on = (monthlyCredits: string | null, limits: Record<string, unknown> = {}): FeatureEntitlement => ({
  enabled: true,
  monthlyCredits,
  limits,
  periodStart: START,
  periodEnd: END,
});

function setup(opts: {
  features?: Record<string, FeatureEntitlement>;
  spent?: Record<string, bigint>;
  counters?: Record<string, bigint>;
  policy?: StoredPayerPolicy | null;
  failFeature?: string;
  failLedger?: boolean;
}) {
  const asked = { features: [] as string[], spent: [] as unknown[][] };
  const entitlements: IEntitlementReader = {
    getFeature: async (payer, featureKey) => {
      expect(payer).toEqual({ type: 'workspace', id: SCHOOL });
      asked.features.push(featureKey);
      if (featureKey === opts.failFeature) throw new Error('subscription down');
      return opts.features?.[featureKey] ?? null;
    },
  };
  const ledger: ILedgerUsageReader = {
    microCreditsSpent: async (...args) => {
      asked.spent.push(args);
      if (opts.failLedger) throw new Error('db down');
      return opts.spent?.[args[1]] ?? 0n;
    },
  };
  const counter = { get: async (key: { capability: string }) => opts.counters?.[key.capability] ?? null } as unknown as IQuotaCounter;
  const policies = { get: async () => opts.policy ?? null } as unknown as IPayerPolicyRepository;
  const handler = new GetPayerUsageHandler(entitlements, policies, new FeatureUsage(ledger, counter));
  return { run: () => handler.execute(new GetPayerUsageQuery('workspace', SCHOOL)), asked };
}

describe('GetPayerUsageHandler', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('lists every AI key in catalog order, off ones without spend', async () => {
    const { run, asked } = setup({
      features: { 'ai.practice': on('1000', { perLearnerMonthlyCredits: '50' }), 'ai.review_draft': on(null) },
      spent: { practice: 12_350_000n, review_draft: 2_000_000n },
    });
    const result = await run();
    expect(asked.features).toEqual([...AI_FEATURE_KEYS]);
    expect(result.kind).toBe('usage');
    if (result.kind !== 'usage') return;
    expect(result.features.map((f) => f.featureKey)).toEqual([...AI_FEATURE_KEYS]);
    expect(result.features.find((f) => f.featureKey === 'ai.practice')).toEqual({
      featureKey: 'ai.practice',
      enabled: true,
      used: '12.350000',
      total: '1000.000000',
      periodEnd: END,
      limits: { perLearnerMonthlyCredits: '50' },
    });
    expect(result.features.find((f) => f.featureKey === 'ai.review_draft')).toMatchObject({ enabled: true, used: '2.000000', total: null });
    expect(result.features.find((f) => f.featureKey === 'ai.authoring')).toEqual({
      featureKey: 'ai.authoring',
      enabled: false,
      used: null,
      total: null,
      periodEnd: null,
      limits: {},
    });
    // The ledger is asked for keys that are on only, by pool.
    expect(asked.spent).toEqual([
      [{ type: 'workspace', id: SCHOOL }, 'review_draft', START, END],
      [{ type: 'workspace', id: SCHOOL }, 'practice', START, END],
    ]);
  });

  it('treats a key the tariff carries switched off as off', async () => {
    const result = await setup({ features: { 'ai.practice': { ...on('100'), enabled: false } } }).run();
    expect(result.kind === 'usage' && result.features.find((f) => f.featureKey === 'ai.practice')).toMatchObject({ enabled: false, used: null });
  });

  it('counts spend as the learner’s readout does — the gate counter when it runs ahead', async () => {
    const result = await setup({ features: { 'ai.practice': on('100') }, spent: { practice: 5_000_000n }, counters: { practice: 7_000_000n } }).run();
    expect(result.kind === 'usage' && result.features.find((f) => f.featureKey === 'ai.practice')?.used).toBe('7.000000');
  });

  it('carries the default policy when none is stored, the stored one otherwise', async () => {
    const byDefault = await setup({}).run();
    expect(byDefault.kind === 'usage' && byDefault.policy).toEqual({
      payerType: 'workspace',
      payerId: SCHOOL,
      aiEnabled: true,
      allowedRegions: null,
      stored: false,
      updatedBy: null,
      updatedAt: null,
    });
    const at = new Date('2026-11-09T10:00:00.000Z');
    const stored = await setup({
      policy: { payerType: 'workspace', payerId: SCHOOL, aiEnabled: false, allowedRegions: ['eu'], updatedBy: 'admin-1', updatedAt: at },
    }).run();
    expect(stored.kind === 'usage' && stored.policy).toMatchObject({ aiEnabled: false, allowedRegions: ['eu'], stored: true, updatedBy: 'admin-1' });
  });

  it('is unavailable when the tariff or the ledger cannot be read', async () => {
    expect(await setup({ failFeature: 'ai.practice' }).run()).toEqual({ kind: 'unavailable' });
    expect(await setup({ features: { 'ai.practice': on('100') }, failLedger: true }).run()).toEqual({ kind: 'unavailable' });
  });
});
