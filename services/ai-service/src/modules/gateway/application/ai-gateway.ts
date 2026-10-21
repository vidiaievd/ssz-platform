import { Injectable } from '@nestjs/common';
import { CallRecorder, type CallToRecord, type RecordedCall } from '../../ledger/application/call-recorder.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ModelRouter, type GatewayRequest, type RouteFailure, type RoutedCall } from './model-router.js';

export interface GatewayCall {
  routed: Result<RoutedCall, RouteFailure>;
  /** The ledger row written for this call. */
  recorded: RecordedCall;
  latencyMs: number;
}

/**
 * The one path from an agent to a model: route (binding → primary → fallback) → ledger.
 * Every call is recorded, whatever happened — a refusal, a failure, an answer that failed
 * the schema. The access gate (step 9) goes in front of the router here.
 */
@Injectable()
export class AiGateway {
  constructor(
    private readonly router: ModelRouter,
    private readonly recorder: CallRecorder,
  ) {}

  async call(capability: string, context: CallContext, request: GatewayRequest): Promise<GatewayCall> {
    const startedAt = new Date();
    const routed = await this.router.call(capability, request);
    const latencyMs = Date.now() - startedAt.getTime();
    const recorded = await this.recorder.record(toRecord(capability, context, routed, latencyMs, startedAt));
    return { routed, recorded, latencyMs };
  }
}

/** What the ledger keeps of a routed call. Exported for tests. */
export function toRecord(
  capability: string,
  context: CallContext,
  routed: Result<RoutedCall, RouteFailure>,
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
