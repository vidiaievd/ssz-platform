import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmModelRef, ModelFeatures } from '../../domain/model-features.js';
import { toGoogleCall } from './google-request.mapper.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: true,
  audioIn: true,
  batch: true,
  promptCache: true,
  contextWindow: 1_048_576,
  maxOutput: 65_536,
};

const model = (over: Partial<ModelFeatures> = {}): LlmModelRef => ({
  providerModelId: 'gemini-2.5-flash',
  features: { ...features, ...over },
  provider: { code: 'google', baseUrl: null, apiVersion: null, credentialRef: 'GEMINI_API_KEY' },
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

const plainSchema = {
  type: 'object',
  required: ['verdict'],
  properties: { verdict: { type: ['string', 'null'] }, note: { type: 'string', minLength: 3 } },
};

const templateStyleSchema = {
  type: 'object',
  properties: { a: { type: 'string' }, b: { type: 'string' } },
  anyOf: [{ required: ['a'] }, { required: ['b'] }],
};

describe('toGoogleCall', () => {
  it('maps roles, system, limits and the timeout; turns SDK-side automation off', () => {
    const { params, mode } = toGoogleCall({ ...base, temperature: 0.2 }, model());
    expect(mode).toBe('none');
    expect(params.model).toBe('gemini-2.5-flash');
    expect(params.contents).toEqual([
      { role: 'user', parts: [{ text: 'one' }] },
      { role: 'model', parts: [{ text: 'two' }] },
    ]);
    expect(params.config).toMatchObject({
      systemInstruction: 'sys',
      maxOutputTokens: 500,
      temperature: 0.2,
      httpOptions: { timeout: 1000 },
      automaticContinuation: false,
      automaticFunctionCalling: { disable: true },
    });
    expect(params.config?.responseMimeType).toBeUndefined();
  });

  it('drops temperature for a model that rejects sampling parameters', () => {
    const { params } = toGoogleCall({ ...base, temperature: 0.2 }, model({ samplingParams: false }));
    expect(params.config?.temperature).toBeUndefined();
  });

  it('native: the downgraded schema goes in responseJsonSchema, the prompt is untouched', () => {
    const { params, mode } = toGoogleCall({ ...base, responseSchema: { name: 'v', schema: plainSchema } }, model());
    expect(mode).toBe('native');
    expect(params.config?.responseMimeType).toBe('application/json');
    expect(params.config?.responseJsonSchema).toEqual({
      type: 'object',
      required: ['verdict'],
      properties: { verdict: { anyOf: [{ type: 'string' }, { type: 'null' }] }, note: { type: 'string' } },
    });
    expect(params.config?.systemInstruction).toBe('sys');
  });

  it('a schema that does not downgrade falls back to json_mode with the full schema in the prompt', () => {
    const { params, mode } = toGoogleCall(
      { ...base, responseSchema: { name: 'pick', schema: templateStyleSchema } },
      model(),
    );
    expect(mode).toBe('json_mode');
    expect(params.config?.responseMimeType).toBe('application/json');
    expect(params.config?.responseJsonSchema).toBeUndefined();
    expect(params.config?.systemInstruction).toContain(JSON.stringify(templateStyleSchema));
  });

  it('a json_mode model gets json_mode even for a schema that would downgrade', () => {
    const { mode, params } = toGoogleCall(
      { ...base, responseSchema: { name: 'v', schema: plainSchema } },
      model({ structuredOutput: 'json_mode' }),
    );
    expect(mode).toBe('json_mode');
    expect(params.config?.responseJsonSchema).toBeUndefined();
  });

  it('with tools declared the schema only goes in the prompt — no JSON mime type', () => {
    const { params, mode } = toGoogleCall(
      {
        ...base,
        responseSchema: { name: 'v', schema: plainSchema },
        tools: [{ name: 'lookup', description: 'd', inputSchema: { type: 'object', properties: {} } }],
      },
      model(),
    );
    expect(mode).toBe('prompt');
    expect(params.config?.responseMimeType).toBeUndefined();
    expect(params.config?.tools).toEqual([
      { functionDeclarations: [{ name: 'lookup', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } }] },
    ]);
    expect(params.config?.systemInstruction).toContain(JSON.stringify(plainSchema));
  });

  it('a model without structured output gets the schema in the prompt only', () => {
    const { mode, params } = toGoogleCall(
      { ...base, responseSchema: { name: 'v', schema: plainSchema } },
      model({ structuredOutput: 'none' }),
    );
    expect(mode).toBe('prompt');
    expect(params.config?.responseMimeType).toBeUndefined();
  });

  it('ignores cacheBoundary — Gemini caches implicitly', () => {
    const { params } = toGoogleCall({ ...base, cacheBoundary: 0 }, model());
    expect(params.config?.cachedContent).toBeUndefined();
  });
});
