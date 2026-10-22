import { REFUSAL_OUTCOME } from '../../access/domain/refusal.js';
import type { GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { ModelRole, RouteAttempt } from '../../gateway/application/model-router.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { LlmOutput, LlmUsage } from '../../providers/domain/llm-result.js';

/** A gateway call told the way an admin endpoint answers it: every outcome is an answer. */
export interface CallReport {
  outcome: 'ok' | 'invalid_response' | 'error' | 'disabled' | 'unavailable' | 'refused_policy' | 'refused_quota';
  /** The provider error, the refusal (`ai_disabled`, `region_not_allowed`, `not_entitled`) or `gate_unavailable`. */
  errorCode: string | null;
  errorMessage: string | null;
  /** The model whose answer (or failure) this is; null when none was called. */
  answeredBy: { modelId: string; providerCode: string; providerModelId: string; role: ModelRole } | null;
  fallbackUsed: boolean;
  promptVersion: string | null;
  attempts: RouteAttempt[];
  output: LlmOutput | null;
  usage: LlmUsage | null;
  latencyMs: number;
  /** The ledger row for this call. */
  callId: string;
  /** Null when the model has no price in effect. */
  cost: { micros: number; currency: string } | null;
  credits: string | null;
}

/** Shared by the admin endpoints that run a capability by hand (`diagnostic`, the review try-out). */
export function describeCall(capability: string, context: CallContext, call: GatewayCall): CallReport {
  const { routed, recorded, latencyMs } = call;
  const ledger = { callId: recorded.callId, cost: recorded.cost, credits: recorded.credits, latencyMs };

  if (routed.isOk) {
    const { result, model, role, binding, attempts } = routed.value;
    return {
      outcome: 'ok',
      errorCode: null,
      errorMessage: null,
      answeredBy: { modelId: model.model.id, providerCode: model.provider.code, providerModelId: model.model.providerModelId, role },
      fallbackUsed: role === 'fallback',
      promptVersion: binding.promptVersion,
      attempts,
      output: result.output,
      usage: result.usage,
      ...ledger,
    };
  }

  const failure = routed.error;
  if (failure.kind !== 'error') {
    const [outcome, errorCode, errorMessage]: [CallReport['outcome'], string | null, string] =
      failure.kind === 'disabled'
        ? ['disabled', null, failure.binding ? `Capability "${capability}" is switched off` : `Capability "${capability}" is not bound`]
        : failure.kind === 'refused'
          ? [REFUSAL_OUTCOME[failure.code], failure.code, `Refused for payer ${context.payer.type}:${context.payer.id}`]
          : failure.kind === 'gate_unavailable'
            ? ['error', 'gate_unavailable', "The payer's policy or tariff could not be read"]
            : ['unavailable', null, 'No model of the binding could be called'];
    return {
      outcome,
      errorCode,
      errorMessage,
      answeredBy: null,
      fallbackUsed: false,
      promptVersion: failure.binding?.promptVersion ?? null,
      attempts: failure.attempts,
      output: null,
      usage: null,
      ...ledger,
    };
  }

  const { error, model, role, binding, raw, attempts } = failure;
  return {
    outcome: error.code === 'invalid_response' ? 'invalid_response' : 'error',
    errorCode: error.code,
    errorMessage: error.message,
    answeredBy: { modelId: model.model.id, providerCode: model.provider.code, providerModelId: model.model.providerModelId, role },
    fallbackUsed: role === 'fallback',
    promptVersion: binding.promptVersion,
    attempts,
    output: raw?.output ?? null,
    usage: raw?.usage ?? null,
    ...ledger,
  };
}
