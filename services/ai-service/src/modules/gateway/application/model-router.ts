import { Inject, Injectable } from '@nestjs/common';
import { regionAllowed } from '../../access/domain/payer-policy.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import { LlmError } from '../../providers/domain/llm-error.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { ModelModality } from '../../providers/domain/model-features.js';
import { SPEECH_ASSESSORS, type SpeechAssessor } from '../../providers/domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../providers/domain/speech-request.js';
import type { SpeechResult } from '../../providers/domain/speech-result.js';
import { wavDurationMs } from '../../providers/domain/wav.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../registry/application/ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { llmModelRef, speechModelRef } from '../../registry/application/model-ref.js';
import { providerReadiness } from '../../registry/application/provider-readiness.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import type { AiRegion } from '../../registry/domain/registry.types.js';
import { Result } from '../../../shared/kernel/result.js';
import { CIRCUIT_BREAKER, type ICircuitBreaker } from './ports/circuit-breaker.port.js';

/** The call as an agent states it; output cap, temperature and timeout come from the binding. */
export type GatewayRequest = Omit<LlmRequest, 'maxOutputTokens' | 'temperature' | 'timeoutMs'>;

/**
 * A request, or how to build one from the binding's `promptVersion` — the admin picks the
 * prompt version on the binding, so an agent with versioned prompts cannot build its
 * request before the binding is read.
 */
export type GatewayInput = GatewayRequest | ((promptVersion: string) => GatewayRequest);

/** A recording as a voice capability states it; the timeout comes from the binding (plan 82, step 8). */
export type SpeechGatewayRequest = Omit<SpeechRequest, 'timeoutMs'>;

export type ModelRole = 'primary' | 'fallback';

/** What the access gate allows this call; null regions = any. */
export interface RouteConstraints {
  allowedRegions: AiRegion[] | null;
}

const NO_CONSTRAINTS: RouteConstraints = { allowedRegions: null };

/** Why a model was stepped over without being called. */
export type SkipReason =
  | 'model_missing'
  /** A model of the other modality — the binding check refuses it, stale data does not. */
  | 'wrong_modality'
  /** A speech model that does not list the recording's language; the fallback may (plan 82, step 8). */
  | 'language_not_supported'
  /** A speech model whose `maxAudioSeconds` is shorter than the recording (Azure REST: 30 s, step 9). */
  | 'audio_too_long'
  /** The provider's region is not one the payer allows. */
  | 'region_not_allowed'
  | 'model_disabled'
  | 'provider_disabled'
  | 'provider_not_configured'
  | 'no_adapter'
  | 'breaker_open';

export interface RouteAttempt {
  role: ModelRole;
  modelId: string;
  outcome: 'ok' | 'error' | 'skipped';
  /** Skip reason, or the error code of a failed call. */
  reason: SkipReason | LlmError['code'] | null;
}

/** A routed call's answer: `R` is `LlmResult` for a language model, `SpeechResult` for a speech one. */
export interface Routed<R> {
  /** For a language model, checked by `SchemaGuard`: a structured answer is `{ kind: 'structured' }`. */
  result: R;
  model: ModelForCall;
  role: ModelRole;
  binding: AiBinding;
  attempts: RouteAttempt[];
}

export type RouteFailureOf<R> =
  /** No binding, or its switch is off: refused before any model. */
  | { kind: 'disabled'; binding: AiBinding | null; attempts: RouteAttempt[] }
  /** Every model was stepped over; none was called. */
  | { kind: 'unavailable'; binding: AiBinding; attempts: RouteAttempt[] }
  /** Every model sits outside the payer's regions: refused by policy, not an outage. */
  | { kind: 'refused'; code: 'region_not_allowed'; binding: AiBinding; attempts: RouteAttempt[] }
  /**
   * The last model called failed. `raw` is set when it answered but the answer was refused
   * (`invalid_response`, `filtered`) — it was billed, and the ledger needs its usage.
   */
  | {
      kind: 'error';
      error: LlmError;
      model: ModelForCall;
      role: ModelRole;
      binding: AiBinding;
      raw: R | null;
      attempts: RouteAttempt[];
    };

export type RoutedCall = Routed<LlmResult>;
export type RouteFailure = RouteFailureOf<LlmResult>;
export type RoutedSpeech = Routed<SpeechResult>;
export type SpeechRouteFailure = RouteFailureOf<SpeechResult>;

/** One model of the route, called: the answer, or a refused answer as an error beside it. */
/** What a speech model must take for a recording; `audioMs` null = not a readable WAV (the adapter refuses it). */
interface RecordingFit {
  language: string;
  audioMs: number | null;
}

type Invoke<R> = (model: ModelForCall) => (() => Promise<Result<R, { error: LlmError; raw: R }>>) | null;

/**
 * Binding → primary model; on a retryable error, a switched-off provider or an open
 * breaker → the fallback. A non-retryable error (`auth`, `invalid_request`, a refused
 * answer) is returned as it is: the fallback would only fail the same way or hide a
 * problem an admin must see.
 *
 * Each model gets one attempt with the binding's full timeout; there is no retry on the
 * same model — the fallback is the retry.
 *
 * A model outside the payer's regions is stepped over like a switched-off one, so an
 * EU-only school whose primary is in the US is answered by an EU fallback. When region is
 * the only reason every model was stepped over, the call is refused by policy rather than
 * reported as an outage.
 *
 * A voice capability (plan 82, step 8) takes the same route with a recording — `callSpeech`:
 * only speech models, through the speech adapters, and a model that does not list the
 * recording's language, or takes less audio than the recording is long, is stepped over to the
 * fallback like a switched-off one.
 */
@Injectable()
export class ModelRouter {
  constructor(
    @Inject(BINDING_SOURCE) private readonly bindings: IBindingSource,
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
    @Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[],
    @Inject(CIRCUIT_BREAKER) private readonly breaker: ICircuitBreaker,
    private readonly guard: SchemaGuard,
    @Inject(SPEECH_ASSESSORS) private readonly assessors: SpeechAssessor[] = [],
  ) {}

  async call(
    capability: string,
    input: GatewayInput,
    constraints: RouteConstraints = NO_CONSTRAINTS,
  ): Promise<Result<RoutedCall, RouteFailure>> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return Result.fail({ kind: 'disabled', binding, attempts: [] });

    const call = typeof input === 'function' ? input(binding.promptVersion) : input;
    const request: LlmRequest = {
      ...call,
      maxOutputTokens: binding.maxOutputTokens,
      timeoutMs: binding.timeoutMs,
      ...(binding.temperature !== null ? { temperature: binding.temperature } : {}),
    };
    return this.route<LlmResult>(binding, 'llm', constraints, (model) => {
      const adapter = this.providers.find((p) => p.kind === model.provider.kind);
      const ref = llmModelRef(model);
      if (!adapter || !ref) return null;
      return async () => {
        const raw = await adapter.complete(request, ref);
        const checked = this.guard.check(raw, request);
        return checked.isFail ? Result.fail({ error: checked.error, raw }) : Result.ok(checked.value);
      };
    });
  }

  /** A recording to a voice capability's speech models (plan 82, step 8). */
  async callSpeech(
    capability: string,
    input: SpeechGatewayRequest,
    constraints: RouteConstraints = NO_CONSTRAINTS,
  ): Promise<Result<RoutedSpeech, SpeechRouteFailure>> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return Result.fail({ kind: 'disabled', binding, attempts: [] });

    const request: SpeechRequest = { ...input, timeoutMs: binding.timeoutMs };
    const invoke: Invoke<SpeechResult> = (model) => {
      const adapter = this.assessors.find((a) => a.kind === model.provider.kind);
      const ref = speechModelRef(model);
      if (!adapter || !ref) return null;
      return async () => Result.ok(await adapter.assess(request, ref));
    };
    const recording: RecordingFit = { language: request.language, audioMs: wavDurationMs(request.audio.data) };
    return this.route(binding, 'speech', constraints, invoke, recording);
  }

  /**
   * Primary, then fallback. `invoke` gives null when no adapter takes the model, else the call:
   * it rejects with an `LlmError` when the provider failed, and fails when the answer came but
   * was refused.
   */
  private async route<R>(
    binding: AiBinding,
    modality: ModelModality,
    constraints: RouteConstraints,
    invoke: Invoke<R>,
    recording: RecordingFit | null = null,
  ): Promise<Result<Routed<R>, RouteFailureOf<R>>> {
    const candidates: Array<{ role: ModelRole; modelId: string }> = [{ role: 'primary', modelId: binding.primaryModelId }];
    if (binding.fallbackModelId) candidates.push({ role: 'fallback', modelId: binding.fallbackModelId });

    const attempts: RouteAttempt[] = [];
    let lastRetryable: { error: LlmError; model: ModelForCall; role: ModelRole } | null = null;

    for (const { role, modelId } of candidates) {
      const model = await this.registry.getModelForCall(modelId, new Date());
      const skip = await this.skipReason(model, modality, constraints, recording);
      const called = !skip && model ? invoke(model) : null;
      if (!model || !called) {
        attempts.push({ role, modelId, outcome: 'skipped', reason: skip ?? 'no_adapter' });
        continue;
      }

      let answer: Result<R, { error: LlmError; raw: R }>;
      try {
        answer = await called();
      } catch (err) {
        if (!(err instanceof LlmError)) throw err;
        attempts.push({ role, modelId, outcome: 'error', reason: err.code });
        if (!err.retryable) return Result.fail({ kind: 'error', error: err, model, role, binding, raw: null, attempts });
        await this.breaker.recordFailure(modelId, err.retryAfterMs);
        lastRetryable = { error: err, model, role };
        continue;
      }

      await this.breaker.recordSuccess(modelId);
      if (answer.isFail) {
        attempts.push({ role, modelId, outcome: 'error', reason: answer.error.error.code });
        return Result.fail({ kind: 'error', error: answer.error.error, model, role, binding, raw: answer.error.raw, attempts });
      }
      attempts.push({ role, modelId, outcome: 'ok', reason: null });
      return Result.ok({ result: answer.value, model, role, binding, attempts });
    }

    if (lastRetryable) return Result.fail({ kind: 'error', ...lastRetryable, binding, raw: null, attempts });
    if (attempts.every((a) => a.reason === 'region_not_allowed')) {
      return Result.fail({ kind: 'refused', code: 'region_not_allowed', binding, attempts });
    }
    return Result.fail({ kind: 'unavailable', binding, attempts });
  }

  private async skipReason(
    model: ModelForCall | null,
    modality: ModelModality,
    constraints: RouteConstraints,
    recording: RecordingFit | null,
  ): Promise<SkipReason | null> {
    if (!model) return 'model_missing';
    if (model.model.modality !== modality) return 'wrong_modality';
    if (!regionAllowed(constraints, model.provider.region)) return 'region_not_allowed';
    if (model.model.status === 'disabled') return 'model_disabled';
    if (!model.provider.enabled) return 'provider_disabled';
    if (!providerReadiness(model.provider, this.credentials).configured) return 'provider_not_configured';
    if (recording && model.model.modality === 'speech') {
      const { features } = model.model;
      if (!features.languages.includes(recording.language)) return 'language_not_supported';
      if (recording.audioMs !== null && recording.audioMs > features.maxAudioSeconds * 1000) return 'audio_too_long';
    }
    if (await this.breaker.isOpen(model.model.id)) return 'breaker_open';
    return null;
  }
}
