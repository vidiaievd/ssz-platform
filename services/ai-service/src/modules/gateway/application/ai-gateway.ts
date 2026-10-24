import { Inject, Injectable } from '@nestjs/common';
import { AccessGate, type GateGrant } from '../../access/application/access-gate.js';
import { REFUSAL_OUTCOME, type RefusalCode } from '../../access/domain/refusal.js';
import { CallRecorder, type CallToRecord, type RecordedCall } from '../../ledger/application/call-recorder.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import { Result } from '../../../shared/kernel/result.js';
import { ModelRouter, type GatewayInput, type RouteAttempt, type RouteFailure, type RoutedCall } from './model-router.js';

export type GatewayFailure =
  | RouteFailure
  /** Refused by the access gate before any model. */
  | { kind: 'refused'; code: RefusalCode; binding: AiBinding; attempts: RouteAttempt[] }
  /** The gate could not read the payer's policy or tariff; refused, not let through. */
  | { kind: 'gate_unavailable'; binding: AiBinding; attempts: RouteAttempt[] };

export interface GatewayCall {
  routed: Result<RoutedCall, GatewayFailure>;
  /** The ledger row written for this call. */
  recorded: RecordedCall;
  latencyMs: number;
}

/**
 * The one path from an agent to a model: the agent's switch → the access gate → route
 * (binding → primary → fallback) → ledger. Every call is recorded, whatever happened — a
 * refusal, a failure, an answer that failed the schema.
 *
 * The switch is checked first and from the binding cache, so a switched-off agent answers
 * "disabled" in about a millisecond without reading any payer's policy.
 *
 * The call's credits are charged to the payer's quota after the ledger row is written: the
 * ledger is the truth the counter is rebuilt from, so it goes first.
 */
@Injectable()
export class AiGateway {
  constructor(
    @Inject(BINDING_SOURCE) private readonly bindings: IBindingSource,
    private readonly gate: AccessGate,
    private readonly router: ModelRouter,
    private readonly recorder: CallRecorder,
  ) {}

  async call(capability: string, context: CallContext, request: GatewayInput): Promise<GatewayCall> {
    const startedAt = new Date();
    const { routed, grant } = await this.route(capability, context, request);
    const latencyMs = Date.now() - startedAt.getTime();
    const recorded = await this.recorder.record(toRecord(capability, context, routed, latencyMs, startedAt));
    if (grant) await this.gate.charge(grant, recorded.credits);
    return { routed, recorded, latencyMs };
  }

  private async route(
    capability: string,
    context: CallContext,
    request: GatewayInput,
  ): Promise<{ routed: Result<RoutedCall, GatewayFailure>; grant: GateGrant | null }> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return { routed: Result.fail({ kind: 'disabled', binding, attempts: [] }), grant: null };

    const access = await this.gate.check(capability, context.payer);
    if (access.isFail) {
      const failure = access.error;
      return {
        routed: Result.fail(
          failure.kind === 'refused'
            ? { kind: 'refused', code: failure.code, binding, attempts: [] }
            : { kind: 'gate_unavailable', binding, attempts: [] },
        ),
        grant: null,
      };
    }
    const grant = access.value;
    return { routed: await this.router.call(capability, request, { allowedRegions: grant.allowedRegions }), grant };
  }
}

/** What the ledger keeps of a routed call. Exported for tests. */
export function toRecord(
  capability: string,
  context: CallContext,
  routed: Result<RoutedCall, GatewayFailure>,
  latencyMs: number,
  startedAt: Date,
): CallToRecord {
  const base = { capability, context, latencyMs, startedAt };

  if (routed.isOk) {
    const { result, model, role, binding, attempts } = routed.value;
    return {
      ...base,
      model,
      promptVersion: binding.promptVersion,
      usage: result.usage,
      outcome: 'ok',
      errorCode: null,
      fallbackUsed: role === 'fallback',
      attempts,
    };
  }

  const failure = routed.error;
  switch (failure.kind) {
    case 'disabled':
      return {
        ...base,
        model: null,
        promptVersion: failure.binding?.promptVersion ?? null,
        usage: null,
        outcome: 'disabled',
        errorCode: null,
        fallbackUsed: false,
        attempts: failure.attempts,
      };
    case 'refused':
      return {
        ...base,
        model: null,
        promptVersion: failure.binding.promptVersion,
        usage: null,
        outcome: REFUSAL_OUTCOME[failure.code],
        errorCode: failure.code,
        fallbackUsed: false,
        attempts: failure.attempts,
      };
    case 'gate_unavailable':
      // Refused because the gate could not check; recorded as a failure of ours, not a refusal by policy.
      return {
        ...base,
        model: null,
        promptVersion: failure.binding.promptVersion,
        usage: null,
        outcome: 'error',
        errorCode: 'gate_unavailable',
        fallbackUsed: false,
        attempts: failure.attempts,
      };
    case 'unavailable':
      // Every model skipped: not a refusal by policy, an outage of the whole binding.
      return {
        ...base,
        model: null,
        promptVersion: failure.binding.promptVersion,
        usage: null,
        outcome: 'error',
        errorCode: 'unavailable',
        fallbackUsed: false,
        attempts: failure.attempts,
      };
    case 'error':
      return {
        ...base,
        model: failure.model,
        promptVersion: failure.binding.promptVersion,
        // A refused answer was still produced and billed; a provider error was not.
        usage: failure.raw?.usage ?? null,
        outcome: failure.error.code === 'invalid_response' ? 'invalid_response' : 'error',
        errorCode: failure.error.code,
        fallbackUsed: failure.role === 'fallback',
        attempts: failure.attempts,
      };
  }
}
