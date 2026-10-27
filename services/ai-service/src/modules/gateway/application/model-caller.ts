import { Inject, Injectable } from '@nestjs/common';
import { CallRecorder, type RecordedCall } from '../../ledger/application/call-recorder.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import { LlmError } from '../../providers/domain/llm-error.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { ModelModality } from '../../providers/domain/model-features.js';
import { SPEECH_ASSESSORS, type SpeechAssessor } from '../../providers/domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../providers/domain/speech-request.js';
import type { SpeechResult } from '../../providers/domain/speech-result.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../registry/application/ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { llmModelRef, speechModelRef } from '../../registry/application/model-ref.js';
import { providerReadiness } from '../../registry/application/provider-readiness.js';
import { Result } from '../../../shared/kernel/result.js';
import type { GatewayRequest, SpeechGatewayRequest } from './model-router.js';

/** Call parameters when the capability has no binding to take them from. */
const DEFAULT_PARAMS = { maxOutputTokens: 4096, timeoutMs: 60_000 };
/** A speech model's timeout without a binding: the CPU sidecar hears about 1.15× real time (plan 82). */
const DEFAULT_SPEECH_TIMEOUT_MS = 90_000;

/** Why a named model cannot be called at all. */
export type ModelUnusable =
  | { kind: 'not_found' }
  /** Credentials or an adapter missing: one readable line per gap. */
  | { kind: 'not_configured'; missing: string[] };

/** `R` is `LlmResult` for a language model, `SpeechResult` for a speech one. */
export type NamedModelOutcome<R = LlmResult> =
  | { kind: 'ok'; result: R }
  /** The model failed, or answered and the answer was refused (`raw` set — it was billed). */
  | { kind: 'error'; error: LlmError; raw: R | null };

export interface NamedModelCall<R = LlmResult> {
  outcome: NamedModelOutcome<R>;
  recorded: RecordedCall;
  latencyMs: number;
}

/**
 * One call to a model an admin names, outside the binding's route — a candidate measured
 * before anything is bound to it (plan 79, step 1.6). No access gate (the platform pays),
 * no fallback (the point is this model's answer) and no circuit breaker: a candidate's
 * failures say nothing about the models serving traffic, and must not open their breaker.
 *
 * Runs whether or not the model or its provider is switched on — trying it first is the
 * point — but not unconfigured. The call parameters (output cap, temperature, timeout)
 * are the capability's binding's, so the candidate is measured under the conditions it
 * would serve in. Every call is a ledger row, like any other.
 *
 * A speech model is called the same way with a recording (`callSpeech`, plan 82 step 10): a
 * recognizer measured on the readings teachers ruled on before a voice capability is bound to it.
 */
@Injectable()
export class ModelCaller {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
    @Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[],
    @Inject(BINDING_SOURCE) private readonly bindings: IBindingSource,
    private readonly guard: SchemaGuard,
    private readonly recorder: CallRecorder,
    @Inject(SPEECH_ASSESSORS) private readonly assessors: SpeechAssessor[] = [],
  ) {}

  /** The model, ready to call as a model of `modality` — or why it is not. */
  async resolve(modelId: string, modality: ModelModality = 'llm'): Promise<Result<ModelForCall, ModelUnusable>> {
    const found = await this.registry.getModelForCall(modelId, new Date());
    if (!found) return Result.fail({ kind: 'not_found' });
    const missing = [...providerReadiness(found.provider, this.credentials).missing];
    if (found.model.modality !== modality) {
      missing.push(`a ${found.model.modality} model, not a ${modality === 'llm' ? 'language' : 'speech'} model`);
    }
    const adapters: Array<{ kind: string }> = modality === 'llm' ? this.providers : this.assessors;
    if (!adapters.some((a) => a.kind === found.provider.kind)) missing.push(`adapter ${found.provider.kind}`);
    return missing.length > 0 ? Result.fail({ kind: 'not_configured', missing }) : Result.ok(found);
  }

  async call(
    capability: string,
    context: CallContext,
    model: ModelForCall,
    promptVersion: string,
    call: GatewayRequest,
  ): Promise<NamedModelCall> {
    const binding = await this.bindings.get(capability);
    const request: LlmRequest = {
      ...call,
      maxOutputTokens: binding?.maxOutputTokens ?? DEFAULT_PARAMS.maxOutputTokens,
      timeoutMs: binding?.timeoutMs ?? DEFAULT_PARAMS.timeoutMs,
      ...(binding && binding.temperature !== null ? { temperature: binding.temperature } : {}),
    };

    const startedAt = new Date();
    const outcome = await this.complete(model, request);
    const latencyMs = Date.now() - startedAt.getTime();
    const errorCode = outcome.kind === 'ok' ? null : outcome.error.code;
    const recorded = await this.recorder.record({
      capability,
      context,
      model,
      promptVersion,
      usage: outcome.kind === 'ok' ? outcome.result.usage : (outcome.raw?.usage ?? null),
      latencyMs,
      outcome: outcome.kind === 'ok' ? 'ok' : errorCode === 'invalid_response' ? 'invalid_response' : 'error',
      errorCode,
      fallbackUsed: false,
      attempts: [{ role: 'primary', modelId: model.model.id, outcome: outcome.kind === 'ok' ? 'ok' : 'error', reason: errorCode }],
      startedAt,
    });
    return { outcome, recorded, latencyMs };
  }

  /**
   * One recording to a named speech model. The timeout is the capability's binding's; the
   * ledger row is priced by the audio the model took, as a routed speech call's is.
   */
  async callSpeech(
    capability: string,
    context: CallContext,
    model: ModelForCall,
    input: SpeechGatewayRequest,
  ): Promise<NamedModelCall<SpeechResult>> {
    const binding = await this.bindings.get(capability);
    const startedAt = new Date();
    const outcome = await this.assess(model, { ...input, timeoutMs: binding?.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS });
    const latencyMs = Date.now() - startedAt.getTime();
    const errorCode = outcome.kind === 'ok' ? null : outcome.error.code;
    const recorded = await this.recorder.record({
      capability,
      context,
      model,
      promptVersion: binding?.promptVersion ?? null,
      usage: null,
      audioMs: outcome.kind === 'ok' ? outcome.result.audioMs : null,
      latencyMs,
      outcome: outcome.kind === 'ok' ? 'ok' : 'error',
      errorCode,
      fallbackUsed: false,
      attempts: [{ role: 'primary', modelId: model.model.id, outcome: outcome.kind === 'ok' ? 'ok' : 'error', reason: errorCode }],
      startedAt,
    });
    return { outcome, recorded, latencyMs };
  }

  private async assess(found: ModelForCall, request: SpeechRequest): Promise<NamedModelOutcome<SpeechResult>> {
    const adapter = this.assessors.find((a) => a.kind === found.provider.kind);
    if (!adapter) throw new Error(`No speech adapter for provider kind "${found.provider.kind}"`);
    const ref = speechModelRef(found);
    if (!ref) throw new Error(`Model ${found.model.id} is not a speech model`);
    try {
      return { kind: 'ok', result: await adapter.assess(request, ref) };
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      return { kind: 'error', error: err, raw: null };
    }
  }

  private async complete(found: ModelForCall, request: LlmRequest): Promise<NamedModelOutcome> {
    const adapter = this.providers.find((p) => p.kind === found.provider.kind);
    if (!adapter) throw new Error(`No adapter for provider kind "${found.provider.kind}"`);
    const ref = llmModelRef(found);
    if (!ref) throw new Error(`Model ${found.model.id} is not a language model`);

    let raw: LlmResult;
    try {
      raw = await adapter.complete(request, ref);
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      return { kind: 'error', error: err, raw: null };
    }
    const checked = this.guard.check(raw, request);
    return checked.isOk ? { kind: 'ok', result: checked.value } : { kind: 'error', error: checked.error, raw };
  }
}
