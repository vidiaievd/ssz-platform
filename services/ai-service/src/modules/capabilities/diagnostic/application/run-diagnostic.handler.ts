import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { REFUSAL_OUTCOME } from '../../../access/domain/refusal.js';
import { AiGateway } from '../../../gateway/application/ai-gateway.js';
import type { ModelRole, RouteAttempt } from '../../../gateway/application/model-router.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import type { LlmOutput, LlmUsage } from '../../../providers/domain/llm-result.js';
import { DIAGNOSTIC, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_SYSTEM } from '../diagnostic.capability.js';
import { DiagnosticPayerResolver } from './diagnostic-payer.resolver.js';
import { RunDiagnosticCommand } from './run-diagnostic.command.js';

export interface DiagnosticResult {
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

/**
 * Sends the admin's text through the gateway under the `diagnostic` binding and reports
 * the route it took. Like the model test, every outcome is an answer — including
 * "disabled" — so the endpoint is a 200 whatever happened.
 *
 * The platform pays, unless the admin names a payer to try that payer's policy and tariff.
 */
@CommandHandler(RunDiagnosticCommand)
export class RunDiagnosticHandler implements ICommandHandler<RunDiagnosticCommand, DiagnosticResult> {
  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: DiagnosticPayerResolver,
  ) {}

  async execute(command: RunDiagnosticCommand): Promise<DiagnosticResult> {
    const context: CallContext = {
      payer: await this.payers.resolve(command),
      actor: { userId: command.actorUserId, role: command.actorRole },
      surface: 'admin_diagnostic',
    };
    const { routed, recorded, latencyMs } = await this.gateway.call(DIAGNOSTIC.code, context, {
      system: DIAGNOSTIC_SYSTEM,
      messages: [{ role: 'user', parts: [{ type: 'text', text: command.text }] }],
      responseSchema: { name: 'diagnostic_echo', schema: DIAGNOSTIC_SCHEMA },
    });
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
      const [outcome, errorCode, errorMessage]: [DiagnosticResult['outcome'], string | null, string] =
        failure.kind === 'disabled'
          ? ['disabled', null, failure.binding ? 'Capability "diagnostic" is switched off' : 'Capability "diagnostic" is not bound']
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
}
