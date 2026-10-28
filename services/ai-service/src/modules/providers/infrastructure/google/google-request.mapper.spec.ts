import { LlmError } from '../../domain/llm-error.js';
import type { LlmMessage, LlmRequest } from '../../domain/llm-request.js';
import { assistantToolTurn, toolResultsTurn } from '../../domain/llm-turns.js';
import type { LlmModelRef, ModelFeatures } from '../../domain/model-features.js';
import { FOREIGN_THOUGHT_SIGNATURE, toGoogleCall } from './google-request.mapper.js';

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

  describe('tool turns', () => {
    const lookup = { name: 'lookup', description: 'Find a unit', inputSchema: { type: 'object' } };
    // One id Gemini made up for us, one a fallback provider wrote.
    const call = assistantToolTurn({
      kind: 'tool_calls',
      text: 'Looking it up.',
      calls: [
        { id: 'gemini_call_0', name: 'lookup', input: { q: 'hus' } },
        { id: 'toolu_1', name: 'fetch_unit', input: 'not json' },
      ],
    });
    const results = toolResultsTurn([
      { callId: 'gemini_call_0', content: '{"title":"Leksjon 1"}' },
      { callId: 'toolu_1', content: 'no such unit', isError: true },
    ]);
    const ask: LlmMessage = { role: 'user', parts: [{ type: 'text', text: 'Hva betyr hus?' }] };
    const tooled: LlmRequest = { ...base, tools: [lookup], messages: [ask, call, results] };

    it('maps calls to functionCall and results to functionResponse named after their call', () => {
      const { params } = toGoogleCall(tooled, model());
      expect(params.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hva betyr hus?' }] },
        {
          role: 'model',
          parts: [
            { text: 'Looking it up.' },
            // Made-up ids stay here; a foreign turn carries the stand-in signature on its first call.
            { functionCall: { name: 'lookup', args: { q: 'hus' } }, thoughtSignature: FOREIGN_THOUGHT_SIGNATURE },
            { functionCall: { id: 'toolu_1', name: 'fetch_unit', args: { input: 'not json' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { name: 'lookup', response: { output: '{"title":"Leksjon 1"}' } } },
            { functionResponse: { id: 'toolu_1', name: 'fetch_unit', response: { error: 'no such unit' } } },
          ],
        },
      ]);
    });

    it('puts function responses before text in a user message', () => {
      const mixed: LlmMessage = { role: 'user', parts: [{ type: 'text', text: 'and?' }, ...results.parts] };
      const { params } = toGoogleCall({ ...tooled, messages: [ask, call, mixed] }, model());
      const parts = (params.contents as any[])[2].parts;
      expect(parts.map((p: object) => Object.keys(p)[0])).toEqual(['functionResponse', 'functionResponse', 'text']);
    });

    it('replays the native turn of the same model verbatim', () => {
      const data = [
        { text: 'plan', thought: true },
        { functionCall: { name: 'lookup', args: { q: 'hus' } }, thoughtSignature: 'sig-1' },
        { functionCall: { id: 'toolu_1', name: 'fetch_unit', args: {} } },
      ];
      const native: LlmMessage = { ...call, native: { provider: 'google', providerModelId: 'gemini-2.5-flash', data } };
      const { params } = toGoogleCall({ ...tooled, messages: [ask, native, results] }, model());
      expect((params.contents as any[])[1]).toEqual({ role: 'model', parts: data });
    });

    it('maps the parts when the native turn came from another model or provider', () => {
      const data = [{ functionCall: { name: 'lookup', args: {} }, thoughtSignature: 'sig-1' }];
      for (const n of [
        { provider: 'google' as const, providerModelId: 'gemini-3-pro', data },
        { provider: 'anthropic' as const, providerModelId: 'gemini-2.5-flash', data },
      ]) {
        const { params } = toGoogleCall({ ...tooled, messages: [ask, { ...call, native: n }, results] }, model());
        expect(JSON.stringify(params.contents)).not.toContain('sig-1');
      }
    });

    it('declares the tools and keeps the schema in the prompt beside them', () => {
      const { params, mode } = toGoogleCall({ ...tooled, responseSchema: { name: 'v', schema: plainSchema } }, model());
      expect(mode).toBe('prompt');
      expect(params.config?.tools).toEqual([
        { functionDeclarations: [{ name: 'lookup', description: 'Find a unit', parametersJsonSchema: { type: 'object' } }] },
      ]);
    });

    it('refuses an unpaired tool history as invalid_request before any call', () => {
      const run = () => toGoogleCall({ ...tooled, messages: [ask, call] }, model());
      expect(run).toThrow(LlmError);
      expect(run).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    });
  });
});
