import { LlmError } from '../../providers/domain/llm-error.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { Result } from '../../../shared/kernel/result.js';
import { toRecord } from './ai-gateway.js';

const context: CallContext = {
  payer: { type: 'platform', id: 'platform' },
  actor: { userId: 'u1', role: 'platform_admin' },
  surface: 'admin_diagnostic',
};

const binding = { promptVersion: 'diagnostic@1' } as AiBinding;
const model = { model: { id: 'm1' }, provider: { id: 'p1' }, currentPrice: null } as unknown as ModelForCall;
const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
const raw: LlmResult = { output: { kind: 'text', text: 'x' }, usage, stop: 'end', providerRequestId: null, latencyMs: 1 };
const at = new Date('2026-10-21T10:00:00Z');

describe('toRecord', () => {
  it('records an answer from the fallback with its usage', () => {
    const attempts = [
      { role: 'primary' as const, modelId: 'm0', outcome: 'error' as const, reason: 'rate_limited' as const },
      { role: 'fallback' as const, modelId: 'm1', outcome: 'ok' as const, reason: null },
    ];
    const rec = toRecord('diagnostic', context, Result.ok({ result: raw, model, role: 'fallback', binding, attempts }), 30, at);
    expect(rec).toMatchObject({ outcome: 'ok', usage, model, fallbackUsed: true, promptVersion: 'diagnostic@1', attempts, latencyMs: 30, startedAt: at });
  });

  it('records a refusal before any model with no model and no usage', () => {
    const rec = toRecord('diagnostic', context, Result.fail({ kind: 'disabled', binding: null, attempts: [] }), 1, at);
    expect(rec).toMatchObject({ outcome: 'disabled', model: null, usage: null, promptVersion: null, errorCode: null });
  });

  it('records a binding whose every model was skipped as an unavailable error', () => {
    const attempts = [{ role: 'primary' as const, modelId: 'm1', outcome: 'skipped' as const, reason: 'provider_disabled' as const }];
    const rec = toRecord('diagnostic', context, Result.fail({ kind: 'unavailable', binding, attempts }), 1, at);
    expect(rec).toMatchObject({ outcome: 'error', errorCode: 'unavailable', model: null, usage: null, attempts });
  });

  it('keeps the usage of an answer that failed the schema — it was billed', () => {
    const failure = { kind: 'error' as const, error: new LlmError('invalid_response', 'bad'), model, role: 'primary' as const, binding, raw, attempts: [] };
    expect(toRecord('diagnostic', context, Result.fail(failure), 1, at)).toMatchObject({
      outcome: 'invalid_response',
      errorCode: 'invalid_response',
      usage,
      model,
    });
  });

  it('records a provider error on the fallback without usage', () => {
    const failure = { kind: 'error' as const, error: new LlmError('timeout', 't'), model, role: 'fallback' as const, binding, raw: null, attempts: [] };
    expect(toRecord('diagnostic', context, Result.fail(failure), 1, at)).toMatchObject({
      outcome: 'error',
      errorCode: 'timeout',
      usage: null,
      fallbackUsed: true,
    });
  });
});
