import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchemaGuard } from '../../../../providers/application/schema-guard.js';
import { LlmError, type LlmErrorCode } from '../../../../providers/domain/llm-error.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../../../providers/domain/llm-request.js';
import type { LlmOutput, LlmStopReason, LlmUsage } from '../../../../providers/domain/llm-result.js';
import { CallRecorder } from '../../../../ledger/application/call-recorder.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from '../../ports/registry.reader.js';
import { llmModelRef } from '../../model-ref.js';
import { providerReadiness } from '../../provider-readiness.js';
import { TestModelCommand } from './test-model.command.js';

export interface TestModelResult {
  outcome: 'ok' | 'invalid_response' | 'error';
  errorCode: LlmErrorCode | null;
  errorMessage: string | null;
  retryable: boolean | null;
  output: LlmOutput | null;
  stop: LlmStopReason | null;
  usage: LlmUsage | null;
  latencyMs: number;
  providerRequestId: string | null;
  /** Zero when the call failed before any answer; null when the model has no price in effect. */
  cost: { micros: number; currency: string } | null;
  credits: string | null;
  /** The ledger row for this test. */
  callId: string;
}

const TEST_SCHEMA = {
  type: 'object',
  required: ['ok', 'echo'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: true },
    echo: { type: 'string', enum: ['pong'] },
  },
};

/**
 * One short structured call to a model, for an admin checking a key or a new model before
 * binding anything to it. Runs whether or not the provider is enabled — trying it first is
 * the point — but not when it is unconfigured, which is a 422 naming what is missing.
 *
 * A failed call is still a 200 with `outcome: 'error'`: the test ran, and its answer is the
 * failure. Every test is a ledger row under capability `diagnostic`, paid by the platform —
 * a real call to a real model, whose cost has to show up somewhere.
 *
 * Language models only: a speech model is a 422 — the check would need a recording, and the
 * recognizer's own check comes with its adapter (plan 82, step 4).
 */
@CommandHandler(TestModelCommand)
export class TestModelHandler implements ICommandHandler<TestModelCommand, TestModelResult> {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
    @Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[],
    private readonly guard: SchemaGuard,
    private readonly recorder: CallRecorder,
  ) {}

  async execute(command: TestModelCommand): Promise<TestModelResult> {
    const found = await this.registry.getModelForCall(command.modelId, new Date());
    if (!found) throw new NotFoundException(`Model ${command.modelId} not found`);
    const { model, provider } = found;
    if (model.modality !== 'llm') {
      throw new UnprocessableEntityException(`Model ${model.id} is a ${model.modality} model: the test covers language models only`);
    }

    const readiness = providerReadiness(provider, this.credentials);
    if (!readiness.configured) {
      throw new UnprocessableEntityException({
        message: `Provider "${provider.code}" is not configured`,
        missing: readiness.missing,
      });
    }
    const adapter = this.providers.find((p) => p.kind === provider.kind);
    if (!adapter) {
      throw new UnprocessableEntityException({
        message: `No adapter for provider kind "${provider.kind}" yet`,
        missing: [`adapter ${provider.kind}`],
      });
    }

    const request: LlmRequest = {
      system: 'You are a connectivity check. Answer exactly in the shape requested, nothing else.',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Reply with ok set to true and echo set to "pong".' }] }],
      responseSchema: { name: 'model_test', schema: TEST_SCHEMA },
      // Room for a thinking model's reasoning before the few tokens of the answer.
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
    };

    const startedAt = new Date();
    const answer = await this.call(adapter, request, found);
    const latencyMs = Date.now() - startedAt.getTime();
    const recorded = await this.recorder.record({
      capability: 'diagnostic',
      context: {
        payer: { type: 'platform', id: 'platform' },
        actor: { userId: command.actorUserId, role: command.actorRole },
        surface: 'admin_model_test',
      },
      model: found,
      promptVersion: null,
      usage: answer.usage,
      latencyMs,
      outcome: answer.outcome,
      errorCode: answer.errorCode,
      fallbackUsed: false,
      attempts: [{ role: 'primary', modelId: model.id, outcome: answer.outcome === 'ok' ? 'ok' : 'error', reason: answer.errorCode }],
      startedAt,
    });
    return { ...answer, latencyMs: answer.latencyMs ?? latencyMs, cost: recorded.cost, credits: recorded.credits, callId: recorded.callId };
  }

  private async call(
    adapter: LlmProvider,
    request: LlmRequest,
    found: ModelForCall,
  ): Promise<Omit<TestModelResult, 'latencyMs' | 'cost' | 'credits' | 'callId'> & { latencyMs: number | null }> {
    try {
      const ref = llmModelRef(found);
      if (!ref) throw new Error(`Model ${found.model.id} is not a language model`);
      const raw = await adapter.complete(request, ref);
      const checked = this.guard.check(raw, request);
      const base = { stop: raw.stop, usage: raw.usage, latencyMs: raw.latencyMs, providerRequestId: raw.providerRequestId };
      if (checked.isOk) {
        return { ...base, outcome: 'ok', errorCode: null, errorMessage: null, retryable: null, output: checked.value.output };
      }
      // The model answered and was billed; what it said is shown so the admin can see why.
      return {
        ...base,
        outcome: checked.error.code === 'invalid_response' ? 'invalid_response' : 'error',
        errorCode: checked.error.code,
        errorMessage: checked.error.message,
        retryable: checked.error.retryable,
        output: raw.output,
      };
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      return {
        outcome: 'error',
        errorCode: err.code,
        errorMessage: err.message,
        retryable: err.retryable,
        output: null,
        stop: null,
        usage: null,
        latencyMs: null,
        providerRequestId: null,
      };
    }
  }
}
