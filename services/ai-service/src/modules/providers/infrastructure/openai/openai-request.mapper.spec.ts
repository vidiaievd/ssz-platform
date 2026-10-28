import { LlmError } from '../../domain/llm-error.js';
import type { LlmMessage, LlmRequest } from '../../domain/llm-request.js';
import { assistantToolTurn, toolResultsTurn } from '../../domain/llm-turns.js';
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

  describe('tool turns', () => {
    const lookup = { name: 'lookup', description: 'Find a unit', inputSchema: { type: 'object' } };
    const call = assistantToolTurn({
      kind: 'tool_calls',
      calls: [
        { id: 'call_1', name: 'lookup', input: { q: 'hus' } },
        { id: 'call_2', name: 'lookup', input: '{"q": "bil"' },
      ],
    });
    const results = toolResultsTurn([
      { callId: 'call_1', content: '{"title":"Leksjon 1"}' },
      { callId: 'call_2', content: 'input is not valid JSON', isError: true },
    ]);
    const ask: LlmMessage = { role: 'user', parts: [{ type: 'text', text: 'Hva betyr hus?' }] };
    const tooled: LlmRequest = { ...base, tools: [lookup], messages: [ask, call, results] };

    it('maps calls to assistant tool_calls and each result to a tool message', () => {
      const { params } = toOpenAiCall(tooled, model(), 'openai');
      expect(params.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'Hva betyr hus?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"hus"}' } },
            // Raw arguments that did not parse go back unchanged.
            { id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"q": "bil"' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"title":"Leksjon 1"}' },
        { role: 'tool', tool_call_id: 'call_2', content: 'Error: input is not valid JSON' },
      ]);
    });

    it('keeps the text the model wrote beside its calls', () => {
      const withText = assistantToolTurn({
        kind: 'tool_calls',
        text: 'Looking it up.',
        calls: [{ id: 'call_1', name: 'lookup', input: {} }],
      });
      const answered = toolResultsTurn([{ callId: 'call_1', content: 'ok' }]);
      const { params } = toOpenAiCall({ ...tooled, messages: [ask, withText, answered] }, model(), 'openai');
      expect(params.messages[2]).toMatchObject({ role: 'assistant', content: 'Looking it up.' });
    });

    it('sends text beside the results as a user message after the tool messages', () => {
      const mixed: LlmMessage = { role: 'user', parts: [{ type: 'text', text: 'and?' }, ...results.parts] };
      const { params } = toOpenAiCall({ ...tooled, messages: [ask, call, mixed] }, model(), 'openai');
      expect(params.messages.slice(3).map((m) => m.role)).toEqual(['tool', 'tool', 'user']);
      expect(params.messages[5]).toEqual({ role: 'user', content: 'and?' });
    });

    it('ignores a native form, even one from another provider', () => {
      const native: LlmMessage = {
        ...call,
        native: { provider: 'anthropic', providerModelId: 'gpt-5.5', data: [{ type: 'thinking', thinking: 'x' }] },
      };
      const { params } = toOpenAiCall({ ...tooled, messages: [ask, native, results] }, model(), 'openai');
      expect(JSON.stringify(params.messages)).not.toContain('thinking');
    });

    it('refuses an unpaired tool history as invalid_request before any call', () => {
      const run = () => toOpenAiCall({ ...tooled, messages: [ask, call] }, model(), 'openai');
      expect(run).toThrow(LlmError);
      expect(run).toThrow(expect.objectContaining({ code: 'invalid_request' }));
    });
  });
});
