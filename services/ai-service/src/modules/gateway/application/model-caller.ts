import { Inject, Injectable } from '@nestjs/common';
import { CallRecorder, type RecordedCall } from '../../ledger/application/call-recorder.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import { LlmError } from '../../providers/domain/llm-error.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../registry/application/ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { providerReadiness } from '../../registry/application/provider-readiness.js';
import { Result } from '../../../shared/kernel/result.js';
import type { GatewayRequest } from './model-router.js';

/** Call parameters when the capability has no binding to take them from. */
const DEFAULT_PARAMS = { maxOutputTokens: 4096, timeoutMs: 60_000 };

/** Why a named model cannot be called at all. */
export type ModelUnusable =
  | { kind: 'not_found' }
  /** Credentials or an adapter missing: one readable line per gap. */
  | { kind: 'not_configured'; missing: string[] };

export type NamedModelOutcome =
  | { kind: 'ok'; result: LlmResult }
  /** The model failed, or answered and the answer was refused (`raw` set — it was billed). */
  | { kind: 'error'; error: LlmError; raw: LlmResult | null };

export interface NamedModelCall {
  outcome: NamedModelOutcome;
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
  ) {}

  /** The model, ready to call — or why it is not. */
  async resolve(modelId: string): Promise<Result<ModelForCall, ModelUnusable>> {
    const found = await this.registry.getModelForCall(modelId, new Date());
    if (!found) return Result.fail({ kind: 'not_found' });
    const missing = [...providerReadiness(found.provider, this.credentials).missing];
    if (!this.providers.some((p) => p.kind === found.provider.kind)) missing.push(`adapter ${found.provider.kind}`);
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

  private async complete(found: ModelForCall, request: LlmRequest): Promise<NamedModelOutcome> {
    const adapter = this.providers.find((p) => p.kind === found.provider.kind);
    if (!adapter) throw new Error(`No adapter for provider kind "${found.provider.kind}"`);

    let raw: LlmResult;
    try {
      raw = await adapter.complete(request, {
        providerModelId: found.model.providerModelId,
        features: found.model.features,
        provider: {
          code: found.provider.code,
          baseUrl: found.provider.baseUrl,
          apiVersion: found.provider.apiVersion,
          credentialRef: found.provider.credentialRef,
        },
      });
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      return { kind: 'error', error: err, raw: null };
    }
    const checked = this.guard.check(raw, request);
    return checked.isOk ? { kind: 'ok', result: checked.value } : { kind: 'error', error: checked.error, raw };
  }
}
