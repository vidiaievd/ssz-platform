import { Logger } from '@nestjs/common';
import type { ILedgerUsageReader } from '../../../../ledger/application/ports/ledger-usage.reader.js';
import type { FeatureEntitlement } from '../../../domain/entitlement.js';
import type { IEntitlementReader } from '../../ports/entitlement.reader.js';
import type { IQuotaCounter } from '../../ports/quota-counter.js';
import { GetMyUsageHandler } from './get-my-usage.handler.js';
import { GetMyUsageQuery } from './get-my-usage.query.js';

const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';
const START = new Date('2026-10-01T00:00:00.000Z');
const END = new Date('2026-11-01T00:00:00.000Z');
const FEATURE: FeatureEntitlement = { enabled: true, monthlyCredits: '100', limits: {}, periodStart: START, periodEnd: END };

function setup(opts: {
  feature?: FeatureEntitlement | null | Error;
  spent?: bigint | Error;
  counter?: bigint | null | Error;
}) {
  const asked: { featureKey?: string; spent?: unknown[]; counter?: unknown } = {};
  const entitlements: IEntitlementReader = {
    getFeature: async (payer, featureKey) => {
      asked.featureKey = featureKey;
      expect(payer).toEqual({ type: 'user', id: LEARNER });
      if (opts.feature instanceof Error) throw opts.feature;
      return opts.feature === undefined ? FEATURE : opts.feature;
    },
  };
  const usage: ILedgerUsageReader = {
    microCreditsSpent: async (...args) => {
      asked.spent = args;
      if (opts.spent instanceof Error) throw opts.spent;
      return opts.spent ?? 0n;
    },
  };
  const counter = {
    get: async (key: unknown) => {
      asked.counter = key;
      if (opts.counter instanceof Error) throw opts.counter;
      return opts.counter ?? null;
    },
  } as unknown as IQuotaCounter;
  return { handler: new GetMyUsageHandler(entitlements, usage, counter), asked };
}

const read = (handler: GetMyUsageHandler, featureKey = 'ai.review_direct') => handler.execute(new GetMyUsageQuery(LEARNER, featureKey));

describe('GetMyUsageHandler', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('reads the learner’s own plan and its ledger over the period', async () => {
    const { handler, asked } = setup({ spent: 12_350_000n });
    expect(await read(handler, 'ai.student_assist')).toEqual({
      kind: 'usage',
      usage: { featureKey: 'ai.student_assist', used: '12.350000', total: '100.000000', periodEnd: END },
    });
    expect(asked.featureKey).toBe('ai.student_assist');
    expect(asked.spent).toEqual([{ type: 'user', id: LEARNER }, 'student_assist', START, END]);
    expect(asked.counter).toEqual({ payer: { type: 'user', id: LEARNER }, capability: 'student_assist', periodStart: START, periodEnd: END });
  });

  it('shows the counter when it runs ahead of the ledger, never below it', async () => {
    expect(await read(setup({ spent: 5_000_000n, counter: 7_000_000n }).handler)).toMatchObject({ usage: { used: '7.000000' } });
    expect(await read(setup({ spent: 5_000_000n, counter: 3_000_000n }).handler)).toMatchObject({ usage: { used: '5.000000' } });
  });

  it('falls back to the ledger when the counter is missing or unreadable', async () => {
    expect(await read(setup({ spent: 5_000_000n, counter: null }).handler)).toMatchObject({ usage: { used: '5.000000' } });
    expect(await read(setup({ spent: 5_000_000n, counter: new Error('redis') }).handler)).toMatchObject({ usage: { used: '5.000000' } });
  });

  it('keeps a spent-over allowance as it is', async () => {
    expect(await read(setup({ spent: 101_000_000n }).handler)).toMatchObject({ usage: { used: '101.000000', total: '100.000000' } });
  });

  it('has no total and asks no counter when unmetered', async () => {
    const { handler, asked } = setup({ feature: { ...FEATURE, monthlyCredits: null }, spent: 2_000_000n });
    expect(await read(handler)).toMatchObject({ usage: { used: '2.000000', total: null } });
    expect(asked.counter).toBeUndefined();
  });

  it('is not entitled when the plan lacks the key or has it off', async () => {
    expect(await read(setup({ feature: null }).handler)).toEqual({ kind: 'not_entitled' });
    expect(await read(setup({ feature: { ...FEATURE, enabled: false } }).handler)).toEqual({ kind: 'not_entitled' });
  });

  it('is unavailable when the plan or the ledger cannot be read', async () => {
    expect(await read(setup({ feature: new Error('subscription down') }).handler)).toEqual({ kind: 'unavailable' });
    expect(await read(setup({ spent: new Error('db down') }).handler)).toEqual({ kind: 'unavailable' });
  });
});
