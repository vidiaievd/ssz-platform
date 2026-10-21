import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway } from '../../../gateway/application/ai-gateway.js';
import type { ModelRole, RouteAttempt } from '../../../gateway/application/model-router.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import type { LlmErrorCode } from '../../../providers/domain/llm-error.js';
import type { LlmOutput, LlmUsage } from '../../../providers/domain/llm-result.js';
import { DIAGNOSTIC, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_SYSTEM } from '../diagnostic.capability.js';
import { RunDiagnosticCommand } from './run-diagnostic.command.js';

export interface DiagnosticResult {
  outcome: 'ok' | 'invalid_response' | 'error' | 'disabled' | 'unavailable';
  errorCode: LlmErrorCode | null;
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
 * The platform pays: an admin's check is not charged to any workspace.
 */
@CommandHandler(RunDiagnosticCommand)
export class RunDiagnosticHandler implements ICommandHandler<RunDiagnosticCommand, DiagnosticResult> {
  constructor(private readonly gateway: AiGateway) {}

  async execute(command: RunDiagnosticCommand): Promise<DiagnosticResult> {
    const context: CallContext = {
      payer: { type: 'platform', id: 'platform' },
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
      return {
        outcome: failure.kind,
        errorCode: null,
        errorMessage:
          failure.kind === 'disabled'
            ? failure.binding
              ? 'Capability "diagnostic" is switched off'
              : 'Capability "diagnostic" is not bound'
            : 'No model of the binding could be called',
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
