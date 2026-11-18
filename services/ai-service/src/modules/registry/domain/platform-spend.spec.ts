import type { ModelFeatures, SpeechFeatures } from '../../providers/domain/model-features.js';
import { buildPlatformSpend, resolveSpendPeriod, type SpendPeriod, type SpendRegistry, type SpendRow } from './platform-spend.js';
import type { AiModel, AiProvider } from './registry.types.js';

const NOW = new Date('2026-11-14T15:30:00.000Z');

function period(from: string, to: string): SpendPeriod {
  const resolved = resolveSpendPeriod(from, to, NOW);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.period;
}

describe('resolveSpendPeriod', () => {
  it('counts 30 days ending today by default, both ends inclusive', () => {
    const resolved = resolveSpendPeriod(undefined, undefined, NOW);
    expect(resolved).toMatchObject({ ok: true, period: { from: '2026-10-16', to: '2026-11-14' } });
    if (!resolved.ok) return;
    expect(resolved.period.days).toHaveLength(30);
    expect(resolved.period.start.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(resolved.period.end.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('takes one day', () => {
    expect(period('2026-11-08', '2026-11-08').days).toEqual(['2026-11-08']);
  });

  it.each([
    ['2026-11-31', '2026-12-01'],
    ['2026-11-1', '2026-11-08'],
    ['yesterday', undefined],
    [undefined, '14.11.2026'],
  ])('refuses %s / %s as a date', (from, to) => {
    expect(resolveSpendPeriod(from, to, NOW).ok).toBe(false);
  });

  it('refuses from after to, and a period over 366 days', () => {
    expect(resolveSpendPeriod('2026-11-09', '2026-11-08', NOW)).toEqual({ ok: false, error: '`from` must not be after `to`' });
    expect(resolveSpendPeriod('2025-11-13', '2026-11-14', NOW).ok).toBe(false);
    expect(resolveSpendPeriod('2025-11-14', '2026-11-14', NOW).ok).toBe(true);
  });
});

const llm: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

const provider = (id: string, code: string, kind: AiProvider['kind']): AiProvider => ({
  id,
  code,
  kind,
  displayName: code,
  baseUrl: null,
  apiVersion: null,
  credentialRef: null,
  region: 'eu',
  enabled: true,
});

const registry: SpendRegistry = {
  providers: [provider('p-az', 'azure-speech', 'azure_speech'), provider('p-g', 'google', 'google')],
  models: [
    {
      id: 'm-az',
      providerId: 'p-az',
      providerCode: 'azure-speech',
      providerModelId: 'pronunciation-assessment',
      displayName: 'Pronunciation Assessment',
      status: 'active',
      modality: 'speech',
      features: {} as SpeechFeatures,
    },
    {
      id: 'm-g',
      providerId: 'p-g',
      providerCode: 'google',
      providerModelId: 'gemini-3.5-flash',
      displayName: 'Gemini 3.5 Flash',
      status: 'active',
      modality: 'llm',
      features: llm,
    },
    {
      id: 'm-idle',
      providerId: 'p-g',
      providerCode: 'google',
      providerModelId: 'gemini-idle',
      displayName: 'Idle',
      status: 'active',
      modality: 'llm',
      features: llm,
    },
  ] as AiModel[],
  bindings: [
    { capability: 'practice_voice', primaryModelId: 'm-az', fallbackModelId: null },
    { capability: 'student_assist', primaryModelId: 'm-g', fallbackModelId: 'm-idle' },
  ],
};

function row(overrides: Partial<SpendRow>): SpendRow {
  return {
    day: '2026-11-08',
    modelId: 'm-az',
    providerId: 'p-az',
    capability: 'practice_voice',
    currency: 'USD',
    calls: 1,
    failed: 0,
    fallbackCalls: 0,
    unpricedCalls: 0,
    inputTokens: 0n,
    outputTokens: 0n,
    cacheReadTokens: 0n,
    cacheWriteTokens: 0n,
    audioMs: 0n,
    characters: 0n,
    costMicros: 0n,
    microCredits: 0n,
    ...overrides,
  };
}

describe('buildPlatformSpend', () => {
  const days = period('2026-11-07', '2026-11-09');

  it('sums per model and capability, biggest USD spend first, money as six-place strings', () => {
    const spend = buildPlatformSpend(
      days,
      [
        row({ calls: 299, audioMs: 736_840n, costMicros: 204_700n, microCredits: 204_700_000n }),
        row({ capability: 'reference_check', calls: 239, failed: 5, audioMs: 541_225n, costMicros: 150_362n, microCredits: 150_362_000n }),
        row({
          modelId: 'm-g',
          providerId: 'p-g',
          capability: 'pronunciation_explain',
          calls: 14,
          inputTokens: 90_000n,
          outputTokens: 6_000n,
          costMicros: 169_562n,
          microCredits: 169_562_000n,
        }),
      ],
      registry,
    );

    expect(spend.models.map((m) => m.modelId)).toEqual(['m-az', 'm-g', 'm-idle']);
    const azure = spend.models[0]!;
    expect(azure).toMatchObject({
      provider: { code: 'azure-speech', kind: 'azure_speech', region: 'eu' },
      model: { providerModelId: 'pronunciation-assessment', modality: 'speech' },
      boundTo: [{ capability: 'practice_voice', role: 'primary' }],
      calls: 538,
      failed: 5,
      audioMs: 1_278_065,
      cost: [{ currency: 'USD', amount: '0.355062' }],
      credits: '355.062000',
    });
    expect(azure.byCapability.map((c) => [c.capability, c.cost[0]!.amount])).toEqual([
      ['practice_voice', '0.204700'],
      ['reference_check', '0.150362'],
    ]);
    expect(spend.totals).toMatchObject({
      calls: 552,
      inputTokens: 90_000,
      outputTokens: 6_000,
      cost: [{ currency: 'USD', amount: '0.524624' }],
    });
  });

  it('lists a bound model with no calls with zeros and its bindings', () => {
    const spend = buildPlatformSpend(days, [], registry);
    expect(spend.models.map((m) => m.modelId).sort()).toEqual(['m-az', 'm-g', 'm-idle']);
    const idle = spend.models.find((m) => m.modelId === 'm-idle')!;
    expect(idle).toMatchObject({ calls: 0, cost: [], credits: '0.000000', byCapability: [] });
    expect(idle.boundTo).toEqual([{ capability: 'student_assist', role: 'fallback' }]);
    expect(spend.totals).toMatchObject({ calls: 0, cost: [] });
  });

  it('keeps unpriced calls apart from money', () => {
    const spend = buildPlatformSpend(
      days,
      [row({ modelId: 'm-g', providerId: 'p-g', currency: null, calls: 5, unpricedCalls: 5 })],
      registry,
    );
    const gemini = spend.models.find((m) => m.modelId === 'm-g')!;
    expect(gemini).toMatchObject({ calls: 5, unpricedCalls: 5, cost: [] });
    expect(spend.totals.unpricedCalls).toBe(5);
  });

  it('names a model gone from the registry by its id, with no model or provider', () => {
    const spend = buildPlatformSpend(days, [row({ modelId: 'm-gone', providerId: 'p-gone', costMicros: 1n })], registry);
    expect(spend.models[0]).toMatchObject({ modelId: 'm-gone', model: null, provider: null, boundTo: [] });
  });

  it('fills every day of the period, with the models of that day', () => {
    const spend = buildPlatformSpend(
      days,
      [
        row({ costMicros: 100n }),
        row({ capability: 'reference_check', costMicros: 50n }),
        row({ modelId: 'm-g', providerId: 'p-g', costMicros: 400n }),
      ],
      registry,
    );
    expect(spend.daily.map((d) => d.day)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09']);
    expect(spend.daily[0]).toEqual({ day: '2026-11-07', calls: 0, cost: [], byModel: [] });
    expect(spend.daily[1]).toEqual({
      day: '2026-11-08',
      calls: 3,
      cost: [{ currency: 'USD', amount: '0.000550' }],
      byModel: [
        { modelId: 'm-g', calls: 1, cost: [{ currency: 'USD', amount: '0.000400' }] },
        { modelId: 'm-az', calls: 2, cost: [{ currency: 'USD', amount: '0.000150' }] },
      ],
    });
  });

  it('keeps currencies apart', () => {
    const spend = buildPlatformSpend(
      days,
      [row({ costMicros: 1_000_000n }), row({ capability: 'x', currency: 'EUR', costMicros: 2_500_000n })],
      registry,
    );
    expect(spend.totals.cost).toEqual([
      { currency: 'EUR', amount: '2.500000' },
      { currency: 'USD', amount: '1.000000' },
    ]);
  });
});
