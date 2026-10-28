import { Inject, Injectable } from '@nestjs/common';
import { AccessGate, type GateGrant } from '../../access/application/access-gate.js';
import { REFUSAL_OUTCOME, type RefusalCode } from '../../access/domain/refusal.js';
import { CallRecorder, type CallToRecord, type RecordedCall } from '../../ledger/application/call-recorder.js';
import type { LlmResult, LlmUsage } from '../../providers/domain/llm-result.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import { Result } from '../../../shared/kernel/result.js';
import type { SpeechResult } from '../../providers/domain/speech-result.js';
import {
  ModelRouter,
  type AnswerListener,
  type GatewayInput,
  type RouteAttempt,
  type RouteConstraints,
  type Routed,
  type RouteFailureOf,
  type SpeechGatewayRequest,
} from './model-router.js';

export type GatewayFailureOf<R> =
  | RouteFailureOf<R>
  /** Refused by the access gate before any model. */
  | { kind: 'refused'; code: RefusalCode; binding: AiBinding; attempts: RouteAttempt[] }
  /** The gate could not read the payer's policy or tariff; refused, not let through. */
  | { kind: 'gate_unavailable'; binding: AiBinding; attempts: RouteAttempt[] };

export type GatewayFailure = GatewayFailureOf<LlmResult>;

/** Why a call would stop before any model: the switch or the gate (the first stage of `call`). */
export type AdmissionFailure =
  | { kind: 'disabled'; binding: AiBinding | null }
  | { kind: 'refused'; code: RefusalCode; binding: AiBinding }
  | { kind: 'gate_unavailable'; binding: AiBinding };

export interface GatewayCallOf<R> {
  routed: Result<Routed<R>, GatewayFailureOf<R>>;
  /** The ledger row written for this call. */
  recorded: RecordedCall;
  latencyMs: number;
}

export type GatewayCall = GatewayCallOf<LlmResult>;
/** A voice capability's call (plan 82, step 8): a recording in, the words heard out. */
export type GatewaySpeechCall = GatewayCallOf<SpeechResult>;

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
 *
 * A voice capability (plan 82, step 8) goes the same way with a recording (`callSpeech`); its
 * ledger row carries the audio it is priced by instead of tokens.
 */
@Injectable()
export class AiGateway {
  constructor(
    @Inject(BINDING_SOURCE) private readonly bindings: IBindingSource,
    private readonly gate: AccessGate,
    private readonly router: ModelRouter,
    private readonly recorder: CallRecorder,
  ) {}

  /**
   * `listener` hears the answer as the model writes it (plan 83, step 9) — unchecked; the call
   * is gated, routed, recorded and charged exactly as without one.
   */
  async call(capability: string, context: CallContext, request: GatewayInput, listener?: AnswerListener): Promise<GatewayCall> {
    return this.run(capability, context, (constraints) => this.router.call(capability, request, constraints, listener), byTokens);
  }

  async callSpeech(capability: string, context: CallContext, request: SpeechGatewayRequest): Promise<GatewaySpeechCall> {
    return this.run(capability, context, (constraints) => this.router.callSpeech(capability, request, constraints), byAudio);
  }

  /**
   * Whether a call to this capability would get past its switch and the gate for this payer —
   * a read, no ledger row: a voice review picks its level by it (plan 82, step 8). The quota
   * is not read; false whenever anything cannot be read.
   */
  async available(capability: string, payer: CallContext['payer']): Promise<boolean> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return false;
    return this.gate.allows(capability, payer);
  }

  /**
   * Whether a call to this capability would get past its switch and the whole gate for this
   * payer, quota included, and if not why — the first stage of `call` without a model, a ledger
   * row or a charge: the learner's client asks it before it shows the assistant (plan 83, step 5).
   * The call itself is checked again.
   */
  async admits(capability: string, payer: CallContext['payer']): Promise<Result<void, AdmissionFailure>> {
    return (await this.admit(capability, payer)).map(() => undefined);
  }

  private async run<R>(
    capability: string,
    context: CallContext,
    route: (constraints: RouteConstraints) => Promise<Result<Routed<R>, RouteFailureOf<R>>>,
    metered: (result: R) => Metered,
  ): Promise<GatewayCallOf<R>> {
    const startedAt = new Date();
    const { routed, grant } = await this.route(capability, context, route);
    const latencyMs = Date.now() - startedAt.getTime();
    const recorded = await this.recorder.record(recordOf(capability, context, routed, latencyMs, startedAt, metered));
    if (grant) await this.gate.charge(grant, recorded.credits);
    return { routed, recorded, latencyMs };
  }

  private async route<R>(
    capability: string,
    context: CallContext,
    route: (constraints: RouteConstraints) => Promise<Result<Routed<R>, RouteFailureOf<R>>>,
  ): Promise<{ routed: Result<Routed<R>, GatewayFailureOf<R>>; grant: GateGrant | null }> {
    const admitted = await this.admit(capability, context.payer);
    if (admitted.isFail) return { routed: Result.fail({ ...admitted.error, attempts: [] }), grant: null };
    const { grant } = admitted.value;
    return { routed: await route({ allowedRegions: grant.allowedRegions }), grant };
  }

  private async admit(
    capability: string,
    payer: CallContext['payer'],
  ): Promise<Result<{ binding: AiBinding; grant: GateGrant }, AdmissionFailure>> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return Result.fail({ kind: 'disabled', binding });

    const access = await this.gate.check(capability, payer);
    if (access.isFail) {
      const failure = access.error;
      return Result.fail(
        failure.kind === 'refused' ? { kind: 'refused', code: failure.code, binding } : { kind: 'gate_unavailable', binding },
      );
    }
    return Result.ok({ binding, grant: access.value });
  }
}

/** What an answer is priced by: a language model's tokens, a speech model's audio. */
interface Metered {
  usage: LlmUsage | null;
  audioMs: number | null;
}

const byTokens = (result: LlmResult): Metered => ({ usage: result.usage, audioMs: null });
const byAudio = (result: SpeechResult): Metered => ({ usage: null, audioMs: result.audioMs });

/** What the ledger keeps of a routed call to a language model. Exported for tests. */
export function toRecord(
  capability: string,
  context: CallContext,
  routed: Result<Routed<LlmResult>, GatewayFailure>,
  latencyMs: number,
  startedAt: Date,
): CallToRecord {
  return recordOf(capability, context, routed, latencyMs, startedAt, byTokens);
}

/** What the ledger keeps of a routed call, priced by `metered`. Exported for tests. */
export function recordOf<R>(
  capability: string,
  context: CallContext,
  routed: Result<Routed<R>, GatewayFailureOf<R>>,
  latencyMs: number,
  startedAt: Date,
  metered: (result: R) => Metered,
): CallToRecord {
  const base = { capability, context, latencyMs, startedAt };

  if (routed.isOk) {
    const { result, model, role, binding, attempts } = routed.value;
    return {
      ...base,
      model,
      promptVersion: binding.promptVersion,
      ...metered(result),
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
        ...(failure.raw ? metered(failure.raw) : { usage: null }),
        outcome: failure.error.code === 'invalid_response' ? 'invalid_response' : 'error',
        errorCode: failure.error.code,
        fallbackUsed: failure.role === 'fallback',
        attempts: failure.attempts,
      };
  }
}
