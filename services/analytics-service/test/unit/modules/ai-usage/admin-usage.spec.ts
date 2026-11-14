import { BadRequestException } from '@nestjs/common';
import {
  cutByCapability,
  cutByPayer,
  cutByWeek,
  isoWeek,
} from '../../../../src/modules/ai-usage/domain/admin-usage.js';
import type { AdminUsageSums } from '../../../../src/modules/ai-usage/domain/admin-usage.js';
import { parseAdminUsageParams } from '../../../../src/modules/ai-usage/controllers/admin-usage.params.js';

const sums = (over: Partial<AdminUsageSums> = {}): AdminUsageSums => ({
  calls: 1,
  unpricedCalls: 0,
  inputTokens: 100n,
  outputTokens: 10n,
  cacheReadTokens: 0n,
  cacheWriteTokens: 0n,
  credits: '1.000000',
  ...over,
});

describe('admin AI usage (plan 90, phase 7, step 12)', () => {
  describe('cutByCapability', () => {
    it('orders by credits, then calls, then name, and totals everything', () => {
      const cut = cutByCapability([
        { capability: 'practice', ...sums({ calls: 5, credits: '2.500000' }) },
        { capability: 'review_draft', ...sums({ calls: 2, credits: '7.000001', unpricedCalls: 1 }) },
        { capability: 'assist', ...sums({ calls: 9, credits: '2.500000' }) },
        { capability: 'diagnostic', ...sums({ calls: 9, credits: '2.500000' }) },
      ]);
      expect(cut.items.map((i) => i.capability)).toEqual(['review_draft', 'assist', 'diagnostic', 'practice']);
      expect(cut.total).toEqual({
        calls: 25,
        unpricedCalls: 1,
        tokens: { input: 400, output: 40, cacheRead: 0, cacheWrite: 0 },
        credits: '14.500001',
      });
    });

    it('answers an empty range with a zero total and no rows', () => {
      expect(cutByCapability([])).toEqual({
        total: { calls: 0, unpricedCalls: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, credits: '0.000000' },
        items: [],
      });
    });
  });

  describe('cutByPayer', () => {
    const rows = [
      { payerType: 'workspace', payerId: 's1', ...sums({ credits: '10.000000' }) },
      { payerType: 'user', payerId: 'u1', ...sums({ credits: '3.000000', calls: 4 }) },
      { payerType: 'user', payerId: 'u2', ...sums({ credits: '3.000000', calls: 2 }) },
      { payerType: 'platform', payerId: 'platform', ...sums({ credits: '0.000000', calls: 7, unpricedCalls: 7 }) },
    ];

    it('keeps the top N by credits and folds the rest into others', () => {
      const cut = cutByPayer(rows, 2);
      expect(cut.payers).toBe(4);
      expect(cut.items.map((i) => i.payerId)).toEqual(['s1', 'u1']);
      expect(cut.others).toMatchObject({ payers: 2, calls: 9, unpricedCalls: 7, credits: '3.000000' });
      expect(cut.total.credits).toBe('16.000000');
      expect(cut.total.calls).toBe(14);
    });

    it('has no others when the top holds every payer', () => {
      const cut = cutByPayer(rows, 100);
      expect(cut.items).toHaveLength(4);
      expect(cut.others).toBeNull();
    });

    it('breaks a full tie by type and id, so the answer is stable', () => {
      const cut = cutByPayer(
        [
          { payerType: 'workspace', payerId: 'b', ...sums() },
          { payerType: 'workspace', payerId: 'a', ...sums() },
          { payerType: 'user', payerId: 'z', ...sums() },
        ],
        3,
      );
      expect(cut.items.map((i) => `${i.payerType}:${i.payerId}`)).toEqual(['user:z', 'workspace:a', 'workspace:b']);
    });
  });

  describe('cutByWeek', () => {
    it('lists every ISO week the range touches, cut at its ends, empty ones as zeros', () => {
      // 2026-11-01 is a Sunday (W44), 2026-11-14 a Saturday (W46).
      const cut = cutByWeek(
        [
          { day: new Date('2026-11-01T00:00:00Z'), ...sums({ credits: '1.500000' }) },
          { day: new Date('2026-11-10T00:00:00Z'), ...sums({ credits: '2.000000' }) },
          { day: new Date('2026-11-14T00:00:00Z'), ...sums({ credits: '0.250000' }) },
        ],
        '2026-11-01',
        '2026-11-14',
      );
      expect(cut.items.map(({ week, from, to, credits, calls }) => ({ week, from, to, credits, calls }))).toEqual([
        { week: '2026-W44', from: '2026-11-01', to: '2026-11-01', credits: '1.500000', calls: 1 },
        { week: '2026-W45', from: '2026-11-02', to: '2026-11-08', credits: '0.000000', calls: 0 },
        { week: '2026-W46', from: '2026-11-09', to: '2026-11-14', credits: '2.250000', calls: 2 },
      ]);
      expect(cut.total.credits).toBe('3.750000');
    });
  });

  describe('isoWeek', () => {
    it.each([
      ['2026-11-14', '2026-W46'],
      ['2026-01-01', '2026-W01'], // Thursday
      ['2027-01-01', '2026-W53'], // Friday of the last week of 2026
      ['2024-12-30', '2025-W01'], // Monday that belongs to the next ISO year
    ])('%s → %s', (day, week) => {
      expect(isoWeek(new Date(`${day}T00:00:00Z`))).toBe(week);
    });
  });

  describe('parseAdminUsageParams', () => {
    const now = new Date('2026-11-14T15:00:00Z');

    it('defaults to the last 30 days by capability, every payer, top 20', () => {
      expect(parseAdminUsageParams({}, now)).toEqual({
        from: '2026-10-16',
        to: '2026-11-14',
        groupBy: 'capability',
        payerType: null,
        limit: 20,
      });
    });

    it('takes what was given', () => {
      expect(
        parseAdminUsageParams({ from: '2026-01-01', to: '2026-03-31', groupBy: 'payer', payerType: 'workspace', limit: '100' }, now),
      ).toEqual({ from: '2026-01-01', to: '2026-03-31', groupBy: 'payer', payerType: 'workspace', limit: 100 });
    });

    it.each([
      [{ from: '2026-11-01' }],
      [{ to: '2026-11-01' }],
      [{ from: '2026-11-02', to: '2026-11-01' }],
      [{ from: '2025-01-01', to: '2026-11-01' }],
      [{ groupBy: 'model' }],
      [{ payerType: 'school' }],
      [{ limit: '0' }],
      [{ limit: '101' }],
      [{ limit: '2.5' }],
      [{ limit: 'ten' }],
    ])('refuses %j', (raw) => {
      expect(() => parseAdminUsageParams(raw, now)).toThrow(BadRequestException);
    });
  });
});
