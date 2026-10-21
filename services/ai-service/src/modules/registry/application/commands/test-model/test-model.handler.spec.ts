import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SchemaGuard } from '../../../../providers/application/schema-guard.js';
import type { LlmProvider } from '../../../../providers/domain/llm-provider.port.js';
import { FakeLlmProvider } from '../../../../providers/infrastructure/fake/fake-llm.provider.js';
import type { ModelForCall, IRegistryReader } from '../../ports/registry.reader.js';
import { TestModelCommand } from './test-model.command.js';
import { TestModelHandler } from './test-model.handler.js';
import { CallRecorder } from '../../../../ledger/application/call-recorder.js';
import type { AiCallRecord } from '../../../../ledger/domain/ai-call.js';

const features = {
  structuredOutput: 'native' as const,
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 1000,
  maxOutput: 1000,
};

function found(over: { kind?: any; providerModelId?: string; credentialRef?: string | null; priced?: boolean } = {}): ModelForCall {
  return {
    model: {
      id: 'm1',
      providerId: 'p1',
      providerCode: 'fake',
      providerModelId: over.providerModelId ?? 'fake',
      displayName: 'Fake',
      features,
      status: 'active',
    },
    provider: {
      id: 'p1',
      code: 'fake',
      kind: over.kind ?? 'fake',
      displayName: 'Fake',
      baseUrl: null,
      apiVersion: null,
      credentialRef: over.credentialRef ?? null,
      region: 'local',
      enabled: false,
    },
    currentPrice:
      over.priced === false
        ? null
        : {
            effectiveFrom: new Date(),
            inputPerMtok: '2',
            outputPerMtok: '10',
            cacheReadPerMtok: '0',
            cacheWritePerMtok: '0',
            currency: 'USD',
          },
  };
}

const written: AiCallRecord[] = [];
const noSpool = { push: async () => undefined, drain: async () => null, deadLetter: async () => undefined };

function handler(row: ModelForCall | null, providers: LlmProvider[] = [new FakeLlmProvider()], keySet = false) {
  const registry = { getModelForCall: async () => row } as unknown as IRegistryReader;
  const recorder = new CallRecorder({ record: async (r) => void written.push(r) }, '1000', noSpool);
  return new TestModelHandler(registry, { isSet: () => keySet }, providers, new SchemaGuard(), recorder);
}

const command = () => new TestModelCommand('m1', 'admin-1', 'platform_admin');

beforeEach(() => {
  written.length = 0;
});

describe('TestModelHandler', () => {
  it('runs a structured call on a disabled provider and reports usage and cost', async () => {
    const result = await handler(found()).execute(command());
    expect(result.outcome).toBe('ok');
    expect(result.output).toEqual({ kind: 'structured', data: { ok: true, echo: 'pong' } });
    expect(result.usage!.input).toBeGreaterThan(0);
    expect(result.cost).toEqual({ micros: expect.any(Number), currency: 'USD' });
    expect(result.cost!.micros).toBeGreaterThan(0);
  });

  it('leaves cost null for an unpriced model', async () => {
    expect((await handler(found({ priced: false })).execute(command())).cost).toBeNull();
  });

  it('reports a provider failure as outcome error, not an exception', async () => {
    const result = await handler(found({ providerModelId: 'fake-auth' })).execute(command());
    expect(result).toMatchObject({ outcome: 'error', errorCode: 'auth', retryable: false, usage: null, cost: { micros: 0 } });
  });

  it('records every test in the ledger as a platform-paid diagnostic call', async () => {
    const result = await handler(found()).execute(command());
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id: result.callId,
      capability: 'diagnostic',
      context: { payer: { type: 'platform', id: 'platform' }, actor: { userId: 'admin-1' }, surface: 'admin_model_test' },
      model: { modelId: 'm1', providerId: 'p1' },
      outcome: 'ok',
      cost: result.cost,
      credits: result.credits,
      attempts: [{ role: 'primary', modelId: 'm1', outcome: 'ok', reason: null }],
    });
  });

  it('records a failed test with its error code and no usage', async () => {
    await handler(found({ providerModelId: 'fake-auth' })).execute(command());
    expect(written[0]).toMatchObject({ outcome: 'error', errorCode: 'auth', usage: null });
  });

  it('records nothing when the test cannot run', async () => {
    await handler(null).execute(command()).catch(() => undefined);
    expect(written).toHaveLength(0);
  });

  it('reports an answer off the schema as invalid_response, with what the model said', async () => {
    const result = await handler(found({ providerModelId: 'fake-invalid-schema' })).execute(command());
    expect(result.outcome).toBe('invalid_response');
    expect(result.output).toEqual({ kind: 'structured', data: { unexpected: true } });
    expect(result.cost).not.toBeNull();
  });

  it('404s on an unknown model', async () => {
    await expect(handler(null).execute(command())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422s on an unconfigured provider, naming what is missing', async () => {
    const err = await handler(found({ kind: 'anthropic', credentialRef: 'ANTHROPIC_API_KEY' }))
      .execute(command())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      missing: ['environment variable ANTHROPIC_API_KEY is not set'],
    });
  });

  it('422s when no adapter exists for the kind yet', async () => {
    const err = await handler(found({ kind: 'google', credentialRef: 'GEMINI_API_KEY' }), [new FakeLlmProvider()], true)
      .execute(command())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ missing: ['adapter google'] });
  });
});
