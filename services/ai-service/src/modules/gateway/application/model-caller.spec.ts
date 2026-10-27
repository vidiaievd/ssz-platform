import type { CallRecorder, CallToRecord } from '../../ledger/application/call-recorder.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { ModelFeatures, ProviderKind } from '../../providers/domain/model-features.js';
import { FakeLlmProvider } from '../../providers/infrastructure/fake/fake-llm.provider.js';
import { FakeSpeechAssessor } from '../../providers/infrastructure/fake/fake-speech.assessor.js';
import type { SpeechAssessor } from '../../providers/domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../providers/domain/speech-request.js';
import { silentWav } from '../../providers/domain/wav.fixture.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import { ModelCaller } from './model-caller.js';
import type { GatewayRequest } from './model-router.js';

// Plan 79, step 1.6.

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

function model(
  id: string,
  over: { providerModelId?: string; enabled?: boolean; status?: 'active' | 'disabled'; kind?: ProviderKind; credentialRef?: string } = {},
): ModelForCall {
  return {
    model: {
      id,
      providerId: `p-${id}`,
      providerCode: 'fake',
      providerModelId: over.providerModelId ?? 'fake',
      displayName: id,
      modality: 'llm',
      features,
      status: over.status ?? 'active',
    },
    provider: {
      id: `p-${id}`,
      code: `prov-${id}`,
      kind: over.kind ?? 'fake',
      displayName: id,
      baseUrl: null,
      apiVersion: null,
      credentialRef: over.credentialRef ?? null,
      region: 'local',
      enabled: over.enabled ?? true,
    },
    currentPrice: null,
  };
}

const BINDING: AiBinding = {
  capability: 'review_draft',
  primaryModelId: 'bound',
  fallbackModelId: null,
  maxOutputTokens: 1234,
  temperature: 0.2,
  timeoutMs: 7_000,
  promptVersion: 'review_draft@1',
  enabled: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: new Date(),
};

const CALL: GatewayRequest = {
  system: 'echo',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'ping' }] }],
  responseSchema: { name: 'echo', schema: { type: 'object', required: ['echo'], properties: { echo: { type: 'string' } } } },
};

const CONTEXT = { payer: { type: 'platform' as const, id: 'platform' }, actor: { userId: 'admin-1', role: 'platform_admin' }, surface: 'admin_eval' };

function speechModel(id: string, providerModelId = 'fake-speech'): ModelForCall {
  const base = model(id, { providerModelId });
  return {
    ...base,
    model: {
      ...base.model,
      modality: 'speech',
      features: { languages: ['nb'], wordTimings: true, pronunciation: false, maxAudioSeconds: 60 },
    },
  };
}

function setup(opts: {
  models: ModelForCall[];
  binding?: AiBinding | null;
  keySet?: boolean;
  providers?: LlmProvider[];
  assessors?: SpeechAssessor[];
}) {
  const byId = new Map(opts.models.map((m) => [m.model.id, m]));
  const records: CallToRecord[] = [];
  const recorder = {
    record: async (r: CallToRecord) => {
      records.push(r);
      return { callId: `call-${records.length}`, cost: { micros: 10, currency: 'USD' }, credits: '0.001000' };
    },
  } as unknown as CallRecorder;
  const caller = new ModelCaller(
    { getModelForCall: async (id: string) => byId.get(id) ?? null } as never,
    { isSet: () => opts.keySet ?? false },
    opts.providers ?? [new FakeLlmProvider()],
    { get: async () => (opts.binding === undefined ? BINDING : opts.binding) },
    new SchemaGuard(),
    recorder,
    opts.assessors ?? [new FakeSpeechAssessor()],
  );
  return { caller, records };
}

describe('ModelCaller', () => {
  describe('resolve', () => {
    it('finds a model that is switched off — trying it first is the point', async () => {
      const { caller } = setup({ models: [model('m', { enabled: false, status: 'disabled' })] });
      const resolved = await caller.resolve('m');
      expect(resolved.isOk).toBe(true);
    });

    it('says the model does not exist', async () => {
      const { caller } = setup({ models: [] });
      expect((await caller.resolve('nope')).error).toEqual({ kind: 'not_found' });
    });

    it('names what is missing: the key, the adapter', async () => {
      const { caller } = setup({ models: [model('m', { kind: 'anthropic', credentialRef: 'ANTHROPIC_API_KEY' })] });
      expect((await caller.resolve('m')).error).toEqual({
        kind: 'not_configured',
        missing: ['environment variable ANTHROPIC_API_KEY is not set', 'adapter anthropic'],
      });
    });
  });

  describe('call', () => {
    it("calls the named model with the binding's parameters and records it", async () => {
      const seen: LlmRequest[] = [];
      const spy: LlmProvider = {
        kind: 'fake',
        complete: async (request, ref) => {
          seen.push(request);
          return new FakeLlmProvider().complete(request, ref);
        },
        stream: () => {
          throw new Error('unused');
        },
      };
      const { caller, records } = setup({ models: [model('cand')], providers: [spy] });
      const result = await caller.call('review_draft', CONTEXT, model('cand'), 'review_draft@2', CALL);

      expect(result.outcome.kind).toBe('ok');
      expect(seen[0]).toMatchObject({ maxOutputTokens: 1234, timeoutMs: 7_000, temperature: 0.2 });
      expect(result.recorded).toEqual({ callId: 'call-1', cost: { micros: 10, currency: 'USD' }, credits: '0.001000' });
      expect(records[0]).toMatchObject({
        capability: 'review_draft',
        context: CONTEXT,
        promptVersion: 'review_draft@2',
        outcome: 'ok',
        fallbackUsed: false,
        attempts: [{ role: 'primary', modelId: 'cand', outcome: 'ok', reason: null }],
      });
    });

    it('falls back to defaults when the capability is not bound', async () => {
      const seen: LlmRequest[] = [];
      const spy = {
        kind: 'fake',
        complete: async (request: LlmRequest, ref: never) => {
          seen.push(request);
          return new FakeLlmProvider().complete(request, ref);
        },
      } as unknown as LlmProvider;
      const { caller } = setup({ models: [model('cand')], providers: [spy], binding: null });
      await caller.call('review_draft', CONTEXT, model('cand'), 'review_draft@1', CALL);

      expect(seen[0]).toMatchObject({ maxOutputTokens: 4096, timeoutMs: 60_000 });
      expect(seen[0]).not.toHaveProperty('temperature');
    });

    it('returns a failure as an outcome, recorded — no fallback, nothing thrown', async () => {
      const { caller, records } = setup({ models: [] });
      const failing = model('cand', { providerModelId: 'fake-rate-limited' });
      const result = await caller.call('review_draft', CONTEXT, failing, 'review_draft@1', CALL);

      expect(result.outcome).toMatchObject({ kind: 'error', error: { code: 'rate_limited' }, raw: null });
      expect(records[0]).toMatchObject({ outcome: 'error', errorCode: 'rate_limited', usage: null });
    });

    it('keeps the usage of an answer refused by the schema guard — it was billed', async () => {
      const { caller, records } = setup({ models: [] });
      const request: GatewayRequest = { ...CALL, system: 'echo @fake:invalid_schema' };
      const result = await caller.call('review_draft', CONTEXT, model('cand'), 'review_draft@1', request);

      expect(result.outcome.kind).toBe('error');
      expect(records[0]!.outcome).toBe('invalid_response');
      expect(records[0]!.usage).not.toBeNull();
    });
  });

  // Plan 82, step 10b: a speech model measured on the readings teachers ruled on.
  describe('speech', () => {
    const PASSAGE = 'Jeg heter Ola og jeg bor i Bergen';
    const recording = { audio: { format: 'wav' as const, data: silentWav(4_000) }, referenceText: PASSAGE, language: 'nb', pronunciation: false };

    it('resolves a speech model asked for as one, and refuses a language model there', async () => {
      const { caller } = setup({ models: [speechModel('whisper'), model('llm')] });
      expect((await caller.resolve('whisper', 'speech')).isOk).toBe(true);
      expect((await caller.resolve('llm', 'speech')).error).toEqual({
        kind: 'not_configured',
        missing: ['a llm model, not a speech model'],
      });
      expect((await caller.resolve('whisper')).error).toEqual({
        kind: 'not_configured',
        missing: ['a speech model, not a language model'],
      });
    });

    it('names a missing speech adapter', async () => {
      const { caller } = setup({ models: [speechModel('whisper')], assessors: [] });
      expect((await caller.resolve('whisper', 'speech')).error).toEqual({ kind: 'not_configured', missing: ['adapter fake'] });
    });

    it("hears the recording with the binding's timeout and records the audio, not tokens", async () => {
      const seen: SpeechRequest[] = [];
      const spy: SpeechAssessor = {
        kind: 'fake',
        assess: async (request, ref) => {
          seen.push(request);
          return new FakeSpeechAssessor().assess(request, ref);
        },
      };
      const binding = { ...BINDING, capability: 'voice_review', timeoutMs: 95_000, promptVersion: '-' };
      const { caller, records } = setup({ models: [], assessors: [spy], binding });
      const result = await caller.callSpeech('voice_review', CONTEXT, speechModel('whisper'), recording);

      expect(result.outcome.kind).toBe('ok');
      expect(seen[0]).toMatchObject({ timeoutMs: 95_000, referenceText: PASSAGE, language: 'nb', pronunciation: false });
      expect(records[0]).toMatchObject({
        capability: 'voice_review',
        promptVersion: '-',
        usage: null,
        audioMs: 4_000,
        outcome: 'ok',
        fallbackUsed: false,
        attempts: [{ role: 'primary', modelId: 'whisper', outcome: 'ok', reason: null }],
      });
    });

    it('waits 90 s for an unbound speech capability', async () => {
      const seen: SpeechRequest[] = [];
      const spy: SpeechAssessor = { kind: 'fake', assess: async (request, ref) => (seen.push(request), new FakeSpeechAssessor().assess(request, ref)) };
      const { caller, records } = setup({ models: [], assessors: [spy], binding: null });
      await caller.callSpeech('voice_review', CONTEXT, speechModel('whisper'), recording);
      expect(seen[0]!.timeoutMs).toBe(90_000);
      expect(records[0]!.promptVersion).toBeNull();
    });

    it('returns a failure as an outcome, recorded without audio', async () => {
      const { caller, records } = setup({ models: [] });
      const failing = { ...recording, referenceText: `${PASSAGE} @fake:timeout` };
      const result = await caller.callSpeech('voice_review', CONTEXT, speechModel('whisper'), failing);

      expect(result.outcome).toMatchObject({ kind: 'error', error: { code: 'timeout' }, raw: null });
      expect(records[0]).toMatchObject({ outcome: 'error', errorCode: 'timeout', audioMs: null });
    });
  });
});
