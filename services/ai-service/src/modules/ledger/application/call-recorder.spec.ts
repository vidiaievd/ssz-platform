import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiCallRecord } from '../domain/ai-call.js';
import { CallRecorder, type CallToRecord } from './call-recorder.js';
import type { IAiCallLedger } from './ports/ai-call.ledger.js';

function model(price: { input: string; output: string; currency?: string } | null): ModelForCall {
  return {
    model: {
      id: 'm1',
      providerId: 'p1',
      providerCode: 'anthropic',
      providerModelId: 'claude-sonnet-5-5',
      displayName: 'Sonnet',
      features: {} as never,
      status: 'active',
    },
    provider: {
      id: 'p1',
      code: 'anthropic',
      kind: 'anthropic',
      displayName: 'Anthropic',
      baseUrl: null,
      apiVersion: null,
      credentialRef: 'ANTHROPIC_API_KEY',
      region: 'us',
      enabled: true,
    },
    currentPrice: price
      ? {
          effectiveFrom: new Date(0),
          inputPerMtok: price.input,
          outputPerMtok: price.output,
          cacheReadPerMtok: '0.3',
          cacheWritePerMtok: '3.75',
          currency: price.currency ?? 'USD',
        }
      : null,
  };
}

function call(over: Partial<CallToRecord> = {}): CallToRecord {
  return {
    capability: 'diagnostic',
    context: { payer: { type: 'platform', id: 'platform' }, actor: { userId: 'u1', role: 'platform_admin' }, surface: 'admin_diagnostic' },
    model: model({ input: '3', output: '15' }),
    promptVersion: 'diagnostic@1',
    usage: { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 },
    latencyMs: 420,
    outcome: 'ok',
    errorCode: null,
    fallbackUsed: false,
    attempts: [{ role: 'primary', modelId: 'm1', outcome: 'ok', reason: null }],
    startedAt: new Date('2026-10-21T10:00:00Z'),
    ...over,
  };
}

function recorder(rate = '1000', ledger?: IAiCallLedger) {
  const written: AiCallRecord[] = [];
  const sink: IAiCallLedger = ledger ?? { record: async (r) => void written.push(r) };
  return { recorder: new CallRecorder(sink, rate), written };
}

describe('CallRecorder', () => {
  it('prices the call at the price the router read and converts it to credits', async () => {
    const { recorder: r, written } = recorder();
    const result = await r.record(call());
    // 1000 × $3/M + 200 × $15/M = $0.003 + $0.003 = 6000 micro-USD → 6 credits at 1000/USD.
    expect(result.cost).toEqual({ micros: 6_000, currency: 'USD' });
    expect(result.credits).toBe('6.000000');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id: result.callId,
      capability: 'diagnostic',
      model: { providerId: 'p1', providerCode: 'anthropic', modelId: 'm1', providerModelId: 'claude-sonnet-5-5' },
      cost: { micros: 6_000, currency: 'USD' },
      credits: '6.000000',
      createdAt: new Date('2026-10-21T10:00:00Z'),
    });
  });

  it('records a call nothing answered at zero cost', async () => {
    const { recorder: r, written } = recorder();
    const result = await r.record(call({ model: null, usage: null, outcome: 'disabled', attempts: [] }));
    expect(result).toMatchObject({ cost: { micros: 0, currency: 'USD' }, credits: '0.000000' });
    expect(written[0]!.model).toBeNull();
  });

  it('records a provider error before any answer at zero cost, with the model it reached', async () => {
    const { recorder: r, written } = recorder();
    await r.record(call({ usage: null, outcome: 'error', errorCode: 'auth' }));
    expect(written[0]).toMatchObject({ cost: { micros: 0 }, credits: '0.000000', model: { modelId: 'm1' }, errorCode: 'auth' });
  });

  it('leaves cost and credits unknown when an answering model has no price', async () => {
    const { recorder: r } = recorder();
    expect(await r.record(call({ model: model(null) }))).toMatchObject({ cost: null, credits: null });
  });

  it('gives no credits for a price outside the rate currency', async () => {
    const { recorder: r } = recorder();
    const result = await r.record(call({ model: model({ input: '3', output: '15', currency: 'EUR' }) }));
    expect(result).toMatchObject({ cost: { micros: 6_000, currency: 'EUR' }, credits: null });
  });

  it('returns the answer even when the ledger write fails', async () => {
    const { recorder: r } = recorder('1000', { record: async () => Promise.reject(new Error('db down')) });
    await expect(r.record(call())).resolves.toMatchObject({ credits: '6.000000' });
  });
});
