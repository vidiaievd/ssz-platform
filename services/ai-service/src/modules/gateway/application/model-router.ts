import { Inject, Injectable } from '@nestjs/common';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import { LlmError } from '../../providers/domain/llm-error.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { BINDING_SOURCE, type IBindingSource } from '../../registry/application/ports/binding.source.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../registry/application/ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { providerReadiness } from '../../registry/application/provider-readiness.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import { Result } from '../../../shared/kernel/result.js';
import { CIRCUIT_BREAKER, type ICircuitBreaker } from './ports/circuit-breaker.port.js';

/** The call as an agent states it; output cap, temperature and timeout come from the binding. */
export type GatewayRequest = Omit<LlmRequest, 'maxOutputTokens' | 'temperature' | 'timeoutMs'>;

export type ModelRole = 'primary' | 'fallback';

/** Why a model was stepped over without being called. */
export type SkipReason =
  | 'model_missing'
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

export interface RoutedCall {
  /** Checked by `SchemaGuard`: a structured answer is `{ kind: 'structured' }`. */
  result: LlmResult;
  model: ModelForCall;
  role: ModelRole;
  binding: AiBinding;
  attempts: RouteAttempt[];
}

export type RouteFailure =
  /** No binding, or its switch is off: refused before any model. */
  | { kind: 'disabled'; binding: AiBinding | null; attempts: RouteAttempt[] }
  /** Every model was stepped over; none was called. */
  | { kind: 'unavailable'; binding: AiBinding; attempts: RouteAttempt[] }
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
      raw: LlmResult | null;
      attempts: RouteAttempt[];
    };

/**
 * Binding → primary model; on a retryable error, a switched-off provider or an open
 * breaker → the fallback. A non-retryable error (`auth`, `invalid_request`, a refused
 * answer) is returned as it is: the fallback would only fail the same way or hide a
 * problem an admin must see.
 *
 * Each model gets one attempt with the binding's full timeout; there is no retry on the
 * same model — the fallback is the retry.
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
  ) {}

  async call(capability: string, call: GatewayRequest): Promise<Result<RoutedCall, RouteFailure>> {
    const binding = await this.bindings.get(capability);
    if (!binding || !binding.enabled) return Result.fail({ kind: 'disabled', binding, attempts: [] });

    const request: LlmRequest = {
      ...call,
      maxOutputTokens: binding.maxOutputTokens,
      timeoutMs: binding.timeoutMs,
      ...(binding.temperature !== null ? { temperature: binding.temperature } : {}),
    };
    const candidates: Array<{ role: ModelRole; modelId: string }> = [{ role: 'primary', modelId: binding.primaryModelId }];
    if (binding.fallbackModelId) candidates.push({ role: 'fallback', modelId: binding.fallbackModelId });

    const attempts: RouteAttempt[] = [];
    let lastRetryable: { error: LlmError; model: ModelForCall; role: ModelRole } | null = null;

    for (const { role, modelId } of candidates) {
      const model = await this.registry.getModelForCall(modelId, new Date());
      const adapter = model ? this.providers.find((p) => p.kind === model.provider.kind) : undefined;
      const skip = await this.skipReason(model, adapter);
      if (skip || !model || !adapter) {
        attempts.push({ role, modelId, outcome: 'skipped', reason: skip });
        continue;
      }

      let raw: LlmResult;
      try {
        raw = await adapter.complete(request, {
          providerModelId: model.model.providerModelId,
          features: model.model.features,
          provider: {
            code: model.provider.code,
            baseUrl: model.provider.baseUrl,
            apiVersion: model.provider.apiVersion,
            credentialRef: model.provider.credentialRef,
          },
        });
      } catch (err) {
        if (!(err instanceof LlmError)) throw err;
        attempts.push({ role, modelId, outcome: 'error', reason: err.code });
        if (!err.retryable) return Result.fail({ kind: 'error', error: err, model, role, binding, raw: null, attempts });
        await this.breaker.recordFailure(modelId, err.retryAfterMs);
        lastRetryable = { error: err, model, role };
        continue;
      }

      await this.breaker.recordSuccess(modelId);
      const checked = this.guard.check(raw, request);
      if (checked.isFail) {
        attempts.push({ role, modelId, outcome: 'error', reason: checked.error.code });
        return Result.fail({ kind: 'error', error: checked.error, model, role, binding, raw, attempts });
      }
      attempts.push({ role, modelId, outcome: 'ok', reason: null });
      return Result.ok({ result: checked.value, model, role, binding, attempts });
    }

    if (lastRetryable) return Result.fail({ kind: 'error', ...lastRetryable, binding, raw: null, attempts });
    return Result.fail({ kind: 'unavailable', binding, attempts });
  }

  private async skipReason(model: ModelForCall | null, adapter: LlmProvider | undefined): Promise<SkipReason | null> {
    if (!model) return 'model_missing';
    if (model.model.status === 'disabled') return 'model_disabled';
    if (!model.provider.enabled) return 'provider_disabled';
    if (!providerReadiness(model.provider, this.credentials).configured) return 'provider_not_configured';
    if (!adapter) return 'no_adapter';
    if (await this.breaker.isOpen(model.model.id)) return 'breaker_open';
    return null;
  }
}
