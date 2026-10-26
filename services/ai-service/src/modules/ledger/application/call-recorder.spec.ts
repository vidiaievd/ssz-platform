import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiCallRecord } from '../domain/ai-call.js';
import { CallRecorder, type CallToRecord } from './call-recorder.js';
import { LedgerRecordRejected, type IAiCallLedger } from './ports/ai-call.ledger.js';
import type { ILedgerSpool } from './ports/ledger-spool.js';

function model(price: { input: string; output: string; audioPerHour?: string; currency?: string } | null): ModelForCall {
  return {
    model: {
      id: 'm1',
      providerId: 'p1',
      providerCode: 'anthropic',
      providerModelId: 'claude-sonnet-5-5',
      displayName: 'Sonnet',
      modality: 'llm',
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
          audioPerHour: price.audioPerHour ?? '0',
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

function memorySpool(available = true) {
  const spooled: AiCallRecord[] = [];
  const spool: ILedgerSpool = {
    push: async (r) => {
      if (!available) throw new Error('redis down');
      spooled.push(r);
    },
    drain: async () => null,
    deadLetter: async () => undefined,
  };
  return { spool, spooled };
}

function recorder(rate = '1000', ledger?: IAiCallLedger, spoolAvailable = true) {
  const written: AiCallRecord[] = [];
  const sink: IAiCallLedger = ledger ?? { record: async (r) => void written.push(r) };
  const { spool, spooled } = memorySpool(spoolAvailable);
  return { recorder: new CallRecorder(sink, rate, spool, [0, 0]), written, spooled };
}

/** Fails the first `failures` writes, then writes. */
function flakyLedger(failures: number, error: Error = new Error('connection reset')) {
  const written: AiCallRecord[] = [];
  let calls = 0;
  const ledger: IAiCallLedger = {
    record: async (r) => {
      calls++;
      if (calls <= failures) throw error;
      written.push(r);
    },
  };
  return { ledger, written, calls: () => calls };
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

  it('prices a speech call by its audio and keeps the length on the row', async () => {
    const { recorder: r, written } = recorder();
    // 90 s at $1/h = $0.025 = 25 000 micro-USD → 25 credits at 1000/USD.
    const result = await r.record(call({ model: model({ input: '0', output: '0', audioPerHour: '1' }), usage: null, audioMs: 90_000 }));
    expect(result).toMatchObject({ cost: { micros: 25_000, currency: 'USD' }, credits: '25.000000' });
    expect(written[0]).toMatchObject({ audioMs: 90_000, usage: null });
  });

  it('leaves a speech call unpriced without a price, and a language call without audio', async () => {
    const { recorder: r, written } = recorder();
    expect(await r.record(call({ model: model(null), usage: null, audioMs: 1_000 }))).toMatchObject({ cost: null, credits: null });
    await r.record(call());
    expect(written[1]!.audioMs).toBeNull();
  });

  it('retries a failed write and records the row on the next attempt', async () => {
    const flaky = flakyLedger(1);
    const { recorder: r, spooled } = recorder('1000', flaky.ledger);
    const result = await r.record(call());
    expect(flaky.calls()).toBe(2);
    expect(flaky.written.map((w) => w.id)).toEqual([result.callId]);
    expect(spooled).toHaveLength(0);
  });

  it('spools the row after three failed attempts and still returns the answer', async () => {
    const flaky = flakyLedger(Infinity);
    const { recorder: r, spooled } = recorder('1000', flaky.ledger);
    const result = await r.record(call());
    expect(result).toMatchObject({ credits: '6.000000' });
    expect(flaky.calls()).toBe(3);
    expect(spooled).toHaveLength(1);
    expect(spooled[0]).toMatchObject({ id: result.callId, credits: '6.000000', createdAt: new Date('2026-10-21T10:00:00Z') });
  });

  it('returns the answer even when both the ledger and the spool are down', async () => {
    const { recorder: r } = recorder('1000', flakyLedger(Infinity).ledger, false);
    await expect(r.record(call())).resolves.toMatchObject({ credits: '6.000000' });
  });

  it('neither retries nor spools a row the database rejects', async () => {
    const flaky = flakyLedger(Infinity, new LedgerRecordRejected('P2000: value too long'));
    const { recorder: r, spooled } = recorder('1000', flaky.ledger);
    await expect(r.record(call())).resolves.toMatchObject({ credits: '6.000000' });
    expect(flaky.calls()).toBe(1);
    expect(spooled).toHaveLength(0);
  });
});
