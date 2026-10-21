import type { FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import type { PayerPolicy, StoredPayerPolicy } from '../domain/payer-policy.js';
import type { QuotaKey } from '../domain/quota.js';
import { AccessGate } from './access-gate.js';
import type { IQuotaCounter } from './ports/quota-counter.js';

const SCHOOL: Payer = { type: 'workspace', id: 'w1' };

const feature = (over: Partial<FeatureEntitlement> = {}): FeatureEntitlement => ({
  enabled: true,
  monthlyCredits: null,
  limits: {},
  periodStart: new Date('2026-10-01T00:00:00Z'),
  periodEnd: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

/** A counter in memory; `down` makes every call throw like an unreachable Redis. */
class MemoryCounter implements IQuotaCounter {
  readonly values = new Map<string, bigint>();
  down = false;
  private id(key: QuotaKey) {
    return `${key.payer.id}:${key.capability}:${key.periodStart.getTime()}`;
  }
  private up() {
    if (this.down) throw new Error('redis down');
  }
  async get(key: QuotaKey) {
    this.up();
    return this.values.get(this.id(key)) ?? null;
  }
  async init(key: QuotaKey, spent: bigint) {
    this.up();
    if (!this.values.has(this.id(key))) this.values.set(this.id(key), spent);
    return this.values.get(this.id(key))!;
  }
  async charge(key: QuotaKey, micro: bigint) {
    this.up();
    const v = this.values.get(this.id(key));
    if (v !== undefined) this.values.set(this.id(key), v + micro);
  }
  async *list() {}
  async raiseTo() {}
  async tryLock() {
    return null;
  }
}

function setup(opts: {
  policy?: PayerPolicy | null;
  feature?: FeatureEntitlement | null;
  policyFails?: boolean;
  tariffFails?: boolean;
  ledgerSpent?: bigint;
}) {
  const asked: string[] = [];
  const counter = new MemoryCounter();
  const ledgerReads: Array<[Date, Date]> = [];
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
    counter,
    {
      microCreditsSpent: async (_p, _c, from, to) => {
        ledgerReads.push([from, to]);
        return opts.ledgerSpent ?? 0n;
      },
    },
  );
  return { gate, asked, counter, ledgerReads };
}

describe('AccessGate', () => {
  it('lets the platform through without reading any policy or tariff', async () => {
    const { gate, asked } = setup({ policyFails: true, tariffFails: true });
    const decision = await gate.check('diagnostic', { type: 'platform', id: 'platform' });
    expect(decision.isOk).toBe(true);
    expect(decision.value).toEqual({ allowedRegions: null, feature: null, quota: null });
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

  describe('quota', () => {
    const TEN = feature({ monthlyCredits: '10' });

    it('counts nothing for an agent without a quota', async () => {
      const { gate, ledgerReads } = setup({});
      expect((await gate.check('diagnostic', SCHOOL)).value.quota).toBeNull();
      expect(ledgerReads).toEqual([]);
    });

    it('starts a missing counter from the ledger over the tariff period', async () => {
      const { gate, counter, ledgerReads } = setup({ feature: TEN, ledgerSpent: 4_000_000n });
      const decision = await gate.check('diagnostic', SCHOOL);
      expect(decision.value.quota?.limitMicro).toBe(10_000_000n);
      expect(ledgerReads).toEqual([[TEN.periodStart, TEN.periodEnd]]);
      expect([...counter.values.values()]).toEqual([4_000_000n]);
    });

    it('refuses with quota_exhausted before any model once the period is spent', async () => {
      const { gate } = setup({ feature: TEN, ledgerSpent: 10_000_000n });
      expect((await gate.check('diagnostic', SCHOOL)).error).toEqual({ kind: 'refused', code: 'quota_exhausted' });
    });

    it('charges a call to the counter it checked, and the next check sees it', async () => {
      const { gate, ledgerReads } = setup({ feature: TEN, ledgerSpent: 9_000_000n });
      const grant = (await gate.check('diagnostic', SCHOOL)).value;
      await gate.charge(grant, '1.000000');
      expect((await gate.check('diagnostic', SCHOOL)).error).toEqual({ kind: 'refused', code: 'quota_exhausted' });
      expect(ledgerReads).toHaveLength(1);
    });

    it('fails open when the counter is unreachable: through, uncounted, and charging does not throw', async () => {
      const { gate, counter } = setup({ feature: TEN, ledgerSpent: 10_000_000n });
      counter.down = true;
      const decision = await gate.check('diagnostic', SCHOOL);
      expect(decision.isOk).toBe(true);
      expect(decision.value.quota).toBeNull();
      await expect(gate.charge({ ...decision.value, quota: { key: {} as QuotaKey, limitMicro: 1n } }, '1.0')).resolves.toBeUndefined();
    });

    it('fails closed on the policy even when the quota would pass', async () => {
      const { gate } = setup({ feature: TEN, policyFails: true });
      expect((await gate.check('diagnostic', SCHOOL)).error).toEqual({ kind: 'gate_unavailable' });
    });
  });
});
