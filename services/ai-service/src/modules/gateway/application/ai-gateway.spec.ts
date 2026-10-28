import { LlmError } from '../../providers/domain/llm-error.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { AccessGate, GateFailure, GateGrant } from '../../access/application/access-gate.js';
import type { CallRecorder, CallToRecord } from '../../ledger/application/call-recorder.js';
import { Result } from '../../../shared/kernel/result.js';
import { AiGateway, toRecord } from './ai-gateway.js';
import type { GatewayRequest, ModelRouter, RouteConstraints } from './model-router.js';

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

  it.each([
    ['ai_disabled', 'refused_policy'],
    ['region_not_allowed', 'refused_policy'],
    ['not_entitled', 'refused_quota'],
  ] as const)('records the refusal %s as %s, with no model and no cost', (code, outcome) => {
    const rec = toRecord('diagnostic', context, Result.fail({ kind: 'refused', code, binding, attempts: [] }), 1, at);
    expect(rec).toMatchObject({ outcome, errorCode: code, model: null, usage: null, promptVersion: 'diagnostic@1' });
  });

  it('records a gate that could not check as an error of ours', () => {
    const rec = toRecord('diagnostic', context, Result.fail({ kind: 'gate_unavailable', binding, attempts: [] }), 1, at);
    expect(rec).toMatchObject({ outcome: 'error', errorCode: 'gate_unavailable', model: null });
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

describe('AiGateway', () => {
  const SCHOOL: CallContext = { ...context, payer: { type: 'workspace', id: 'w1' } };
  const CALL = { system: 's', messages: [] } as unknown as GatewayRequest;

  function setup(opts: { binding: AiBinding | null; gate?: Result<GateGrant, GateFailure>; allows?: boolean }) {
    const log: string[] = [];
    const recorded: CallToRecord[] = [];
    let constraints: RouteConstraints | undefined;
    const gateway = new AiGateway(
      { get: async () => opts.binding },
      {
        check: async () => {
          log.push('gate');
          return opts.gate ?? Result.ok({ allowedRegions: ['eu'], feature: null, quota: null });
        },
        charge: async (_g: GateGrant, credits: string | null) => {
          log.push(`charge ${credits}`);
        },
        allows: async () => {
          log.push('allows');
          return opts.allows ?? true;
        },
      } as unknown as AccessGate,
      {
        call: async (_c: string, _r: GatewayRequest, given: RouteConstraints) => {
          log.push('router');
          constraints = given;
          return Result.fail({ kind: 'unavailable', binding: opts.binding!, attempts: [] });
        },
        callSpeech: async (_c: string, _r: unknown, given: RouteConstraints) => {
          log.push('router speech');
          constraints = given;
          return Result.ok({ result: { transcript: 'jeg bor', words: [], pronunciation: null, audioMs: 2_400 }, model, role: 'primary', binding: opts.binding!, attempts: [] });
        },
      } as unknown as ModelRouter,
      {
        record: async (call: CallToRecord) => {
          log.push('record');
          recorded.push(call);
          return { callId: 'c1', cost: null, credits: '0.500000' };
        },
      } as unknown as CallRecorder,
    );
    return { gateway, log, recorded, constraints: () => constraints };
  }

  it('answers a switched-off agent without asking the gate or the router', async () => {
    const { gateway, log, recorded } = setup({ binding: { ...binding, enabled: false } });
    const { routed } = await gateway.call('diagnostic', SCHOOL, CALL);
    expect(routed.error.kind).toBe('disabled');
    expect(log).toEqual(['record']);
    expect(recorded[0]?.outcome).toBe('disabled');
  });

  it('does not reach the router when the gate refuses, and records the refusal', async () => {
    const { gateway, log, recorded } = setup({
      binding: { ...binding, enabled: true },
      gate: Result.fail({ kind: 'refused', code: 'not_entitled' }),
    });
    const { routed } = await gateway.call('diagnostic', SCHOOL, CALL);
    expect(routed.error).toMatchObject({ kind: 'refused', code: 'not_entitled' });
    expect(log).toEqual(['gate', 'record']);
    expect(recorded[0]).toMatchObject({ outcome: 'refused_quota', errorCode: 'not_entitled' });
  });

  it('passes the payer’s regions to the router, then records, then charges the quota', async () => {
    const { gateway, log, constraints } = setup({ binding: { ...binding, enabled: true } });
    await gateway.call('diagnostic', SCHOOL, CALL);
    expect(log).toEqual(['gate', 'router', 'record', 'charge 0.500000']);
    expect(constraints()).toEqual({ allowedRegions: ['eu'] });
  });

  describe('speech (plan 82, step 8)', () => {
    const HEAR = { audio: { format: 'wav' as const, data: new Uint8Array() }, referenceText: 'Jeg bor', language: 'nb', pronunciation: false };

    it('takes a recording the same way — gate, router, ledger, quota — and records its audio, not tokens', async () => {
      const { gateway, log, recorded, constraints } = setup({ binding: { ...binding, enabled: true } });
      const { routed } = await gateway.callSpeech('voice_review', SCHOOL, HEAR);
      expect(routed.isOk).toBe(true);
      expect(log).toEqual(['gate', 'router speech', 'record', 'charge 0.500000']);
      expect(constraints()).toEqual({ allowedRegions: ['eu'] });
      expect(recorded[0]).toMatchObject({ capability: 'voice_review', outcome: 'ok', usage: null, audioMs: 2_400 });
    });

    it('is available only with its switch on and the gate allowing, writing no ledger row', async () => {
      const off = setup({ binding: { ...binding, enabled: false } });
      expect(await off.gateway.available('voice_review_pronunciation', SCHOOL.payer)).toBe(false);
      expect(off.log).toEqual([]);

      const refused = setup({ binding: { ...binding, enabled: true }, allows: false });
      expect(await refused.gateway.available('voice_review_pronunciation', SCHOOL.payer)).toBe(false);

      const open = setup({ binding: { ...binding, enabled: true } });
      expect(await open.gateway.available('voice_review_pronunciation', SCHOOL.payer)).toBe(true);
      expect(open.log).toEqual(['allows']);
    });
  });
});
