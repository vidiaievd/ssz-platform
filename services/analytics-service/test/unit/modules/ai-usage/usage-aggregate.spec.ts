import {
  aggregateAiUsage,
  formatMicroCredits,
  parseMicroCredits,
} from '../../../../src/modules/ai-usage/domain/usage-aggregate.js';
import type { AiUsageRow } from '../../../../src/modules/ai-usage/domain/usage-aggregate.js';
import { singleCallHistogram } from '../../../../src/modules/ai-usage/domain/latency-histogram.js';

const row = (over: Partial<AiUsageRow> = {}): AiUsageRow => ({
  day: new Date('2026-10-21T00:00:00Z'),
  capability: 'diagnostic',
  providerCode: 'fake',
  providerModelId: 'fake-small',
  payerType: 'platform',
  payerId: 'platform',
  outcome: 'ok',
  calls: 1,
  fallbackCalls: 0,
  unpricedCalls: 0,
  inputTokens: 25n,
  outputTokens: 4n,
  cacheReadTokens: 0n,
  cacheWriteTokens: 0n,
  credits: '0.135000',
  latencySumMs: 400n,
  latencyMinMs: 400,
  latencyMaxMs: 400,
  latencyBuckets: singleCallHistogram(400),
  ...over,
});

describe('micro-credits', () => {
  it('round-trips the six-place decimal exactly', () => {
    expect(parseMicroCredits('0.135000')).toBe(135_000n);
    expect(parseMicroCredits('12')).toBe(12_000_000n);
    expect(parseMicroCredits('0.1')).toBe(100_000n);
    expect(formatMicroCredits(135_000n * 3n)).toBe('0.405000');
    expect(formatMicroCredits(0n)).toBe('0.000000');
  });

  it('adds without floating-point drift', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004.
    const sum = parseMicroCredits('0.100000') + parseMicroCredits('0.200000');
    expect(formatMicroCredits(sum)).toBe('0.300000');
  });
});

describe('aggregateAiUsage', () => {
  it('folds everything into one total when nothing is grouped by', () => {
    const groups = aggregateAiUsage(
      [row(), row({ day: new Date('2026-10-20T00:00:00Z'), outcome: 'error', credits: '0.000000' })],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: {},
      calls: 2,
      tokens: { input: 50, output: 8, cacheRead: 0, cacheWrite: 0 },
      credits: '0.135000',
      latencyMs: { avg: 400, max: 400 },
    });
  });

  it('groups by model with its provider, keeping refusals as their own null-model group', () => {
    const groups = aggregateAiUsage(
      [
        row(),
        row({ providerModelId: 'fake-large' }),
        row({ providerCode: null, providerModelId: null, outcome: 'refused_quota', credits: '0.000000' }),
      ],
      ['model'],
    );
    expect(groups.map((g) => g.key)).toEqual([
      { providerCode: 'fake', providerModelId: 'fake-small' },
      { providerCode: 'fake', providerModelId: 'fake-large' },
      { providerCode: null, providerModelId: null },
    ]);
  });

  it('keeps payer type and id together', () => {
    const groups = aggregateAiUsage(
      [row({ payerType: 'workspace', payerId: 'w1' }), row({ payerType: 'user', payerId: 'w1' })],
      ['payer'],
    );
    expect(groups).toHaveLength(2);
  });

  it('merges histograms so percentiles cover the whole group', () => {
    const slow = row({
      day: new Date('2026-10-20T00:00:00Z'),
      latencySumMs: 9_000n,
      latencyMinMs: 9_000,
      latencyMaxMs: 9_000,
      latencyBuckets: singleCallHistogram(9_000),
    });
    const [total] = aggregateAiUsage([row(), slow], []);
    expect(total.latencyMs.min).toBe(400);
    expect(total.latencyMs.max).toBe(9_000);
    expect(total.latencyMs.p95).toBeGreaterThan(7_500);
    expect(total.latencyMs.avg).toBe(4_700);
  });

  it('reports unpriced calls apart from the credits', () => {
    const [total] = aggregateAiUsage([row(), row({ credits: '0.000000', unpricedCalls: 1 })], []);
    expect(total.credits).toBe('0.135000');
    expect(total.unpricedCalls).toBe(1);
  });
});
