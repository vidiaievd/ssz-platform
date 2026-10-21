import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmModelRef, ModelFeatures } from '../../domain/model-features.js';
import {
  errorCorrectionContentSchema,
  translateContentSchema,
  writingTaskContentSchema,
} from '../template-schemas.fixture.js';
import { toOpenAiCall } from './openai-request.mapper.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: true,
  audioIn: false,
  batch: true,
  promptCache: true,
  contextWindow: 272_000,
  maxOutput: 128_000,
};

const model = (over: Partial<ModelFeatures> = {}): LlmModelRef => ({
  providerModelId: 'gpt-5.5',
  features: { ...features, ...over },
  provider: { code: 'openai', baseUrl: null, apiVersion: null, credentialRef: 'OPENAI_API_KEY' },
});

const base: LlmRequest = {
  system: 'sys',
  messages: [
    { role: 'user', parts: [{ type: 'text', text: 'one' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'two' }] },
  ],
  maxOutputTokens: 500,
  timeoutMs: 1000,
};

/** Already in strict form: every property required, the object closed. */
const strictReady = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['ok', 'retry'] }, score: { type: 'number' } },
  required: ['verdict', 'score'],
  additionalProperties: false,
};

describe('toOpenAiCall', () => {
  it('puts the system prompt first and keeps a lone text part as a plain string', () => {
    const { params, mode } = toOpenAiCall(base, model(), 'openai');
    expect(mode).toBe('none');
    expect(params.model).toBe('gpt-5.5');
    expect(params.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ]);
    expect(params.response_format).toBeUndefined();
  });

  it('sends several parts as content parts', () => {
    const { params } = toOpenAiCall(
      { ...base, messages: [{ role: 'user', parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] },
      model(),
      'openai',
    );
    expect(params.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    });
  });

  it('OpenAI and Azure get max_completion_tokens; a compatible server gets max_tokens', () => {
    for (const kind of ['openai', 'azure_openai'] as const) {
      const { params } = toOpenAiCall(base, model(), kind);
      expect(params.max_completion_tokens).toBe(500);
      expect(params.max_tokens).toBeUndefined();
    }
    const { params } = toOpenAiCall(base, model(), 'openai_compatible');
    expect(params.max_tokens).toBe(500);
    expect(params.max_completion_tokens).toBeUndefined();
  });

  it('a strict-ready schema goes as strict json_schema', () => {
    const { params, mode } = toOpenAiCall(
      { ...base, responseSchema: { name: 'verdict', schema: strictReady } },
      model(),
      'openai',
    );
    expect(mode).toBe('strict');
    expect(params.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'verdict', schema: strictReady, strict: true },
    });
    expect(params.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('a schema with optional properties falls back to non-strict json_schema, unchanged', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a'] };
    const { params, mode } = toOpenAiCall({ ...base, responseSchema: { name: 'loose', schema } }, model(), 'openai');
    expect(mode).toBe('loose');
    expect(params.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'loose', schema, strict: false } });
  });

  it.each([
    ['translate', translateContentSchema],
    ['error_correction', errorCorrectionContentSchema],
    ['writing_task', writingTaskContentSchema],
  ])('the real %s schema cannot take strict mode and goes loose', (name, schema) => {
    const { mode } = toOpenAiCall(
      { ...base, responseSchema: { name, schema: schema as Record<string, unknown> } },
      model(),
      'openai',
    );
    expect(mode).toBe('loose');
  });

  it('json_mode: json_object plus the schema in the system prompt', () => {
    const { params, mode } = toOpenAiCall(
      { ...base, responseSchema: { name: 'verdict', schema: strictReady } },
      model({ structuredOutput: 'json_mode' }),
      'openai_compatible',
    );
    expect(mode).toBe('json_mode');
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.messages[0]!.content).toContain('JSON Schema');
    expect(params.messages[0]!.content).toContain(JSON.stringify(strictReady));
  });

  it('no structured output at all: the schema rides in the prompt only', () => {
    const { params, mode } = toOpenAiCall(
      { ...base, responseSchema: { name: 'verdict', schema: strictReady } },
      model({ structuredOutput: 'none' }),
      'openai_compatible',
    );
    expect(mode).toBe('prompt');
    expect(params.response_format).toBeUndefined();
    expect(params.messages[0]!.content).toContain(JSON.stringify(strictReady));
  });

  it('declares tools as functions, alongside a response format', () => {
    const { params } = toOpenAiCall(
      {
        ...base,
        tools: [{ name: 'lookup', description: 'Look up a word', inputSchema: { type: 'object' } }],
        responseSchema: { name: 'verdict', schema: strictReady },
      },
      model(),
      'openai',
    );
    expect(params.tools).toEqual([
      { type: 'function', function: { name: 'lookup', description: 'Look up a word', parameters: { type: 'object' } } },
    ]);
    expect(params.response_format).toBeDefined();
  });

  it('drops temperature for a model that rejects sampling parameters', () => {
    expect(toOpenAiCall({ ...base, temperature: 0.2 }, model(), 'openai').params.temperature).toBe(0.2);
    expect(
      toOpenAiCall({ ...base, temperature: 0.2 }, model({ samplingParams: false }), 'openai').params.temperature,
    ).toBeUndefined();
  });

  it('ignores cacheBoundary — the cache is automatic', () => {
    const { params } = toOpenAiCall({ ...base, cacheBoundary: 0 }, model(), 'openai');
    expect(JSON.stringify(params)).not.toContain('cache');
  });
});
