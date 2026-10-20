import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmModelRef, ModelFeatures } from '../../domain/model-features.js';
import { ANSWER_TOOL, toAnthropicCall } from './anthropic-request.mapper.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: true,
  audioIn: false,
  batch: true,
  promptCache: true,
  contextWindow: 1_000_000,
  maxOutput: 128_000,
};

const model = (over: Partial<ModelFeatures> = {}): LlmModelRef => ({
  providerModelId: 'claude-sonnet-5-5',
  features: { ...features, ...over },
  provider: { code: 'anthropic', baseUrl: null, apiVersion: null, credentialRef: 'ANTHROPIC_API_KEY' },
});

const base: LlmRequest = {
  system: 'sys',
  messages: [
    { role: 'user', parts: [{ type: 'text', text: 'one' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'two' }] },
    { role: 'user', parts: [{ type: 'text', text: 'three' }] },
  ],
  maxOutputTokens: 500,
  timeoutMs: 1000,
};

const plainSchema = {
  type: 'object',
  required: ['verdict'],
  properties: { verdict: { type: 'string', enum: ['yes', 'no'] }, note: { type: 'string', minLength: 3 } },
};

// How template schemas are written: the anyOf branches only pick what is required.
const templateSchema = {
  type: 'object',
  anyOf: [{ required: ['questions'] }, { required: ['question'] }],
  properties: { questions: { type: 'array' }, question: { type: 'string' } },
};

describe('toAnthropicCall', () => {
  it('maps a plain request without schema or cache', () => {
    const { params, mode } = toAnthropicCall(base, model());
    expect(mode).toBe('none');
    expect(params).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 500,
      system: 'sys',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'one' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'two' }] },
        { role: 'user', content: [{ type: 'text', text: 'three' }] },
      ],
    });
  });

  it('uses native structured output with the strict rewrite of the schema', () => {
    const { params, mode } = toAnthropicCall({ ...base, responseSchema: { name: 'v', schema: plainSchema } }, model());
    expect(mode).toBe('native');
    expect(params.output_config?.format?.type).toBe('json_schema');
    const sent = params.output_config!.format!.schema as Record<string, any>;
    expect(sent['additionalProperties']).toBe(false);
    // The strict rewrite keeps no minLength — which is why SchemaGuard checks the original.
    expect(sent['properties']['note']['minLength']).toBeUndefined();
    expect(params.tools).toBeUndefined();
  });

  it('does not mutate the caller schema', () => {
    const schema = structuredClone(plainSchema);
    toAnthropicCall({ ...base, responseSchema: { name: 'v', schema } }, model());
    expect(schema).toEqual(plainSchema);
  });

  it('falls back to the answer tool when the strict rewrite cannot take the schema', () => {
    const { params, mode } = toAnthropicCall({ ...base, responseSchema: { name: 'mc', schema: templateSchema } }, model());
    expect(mode).toBe('wrapper');
    expect(params.output_config).toBeUndefined();
    expect(params.tools).toEqual([expect.objectContaining({ name: ANSWER_TOOL, input_schema: templateSchema })]);
    expect(params.system).toContain(ANSWER_TOOL);
    expect(params.tool_choice).toBeUndefined();
  });

  it('uses the answer tool for a model without native structured output', () => {
    const { mode } = toAnthropicCall(
      { ...base, responseSchema: { name: 'v', schema: plainSchema } },
      model({ structuredOutput: 'none' }),
    );
    expect(mode).toBe('wrapper');
  });

  it('refuses an agent tool that takes the reserved name', () => {
    const req: LlmRequest = {
      ...base,
      responseSchema: { name: 'v', schema: plainSchema },
      tools: [{ name: ANSWER_TOOL, description: 'x', inputSchema: { type: 'object' } }],
    };
    expect(() => toAnthropicCall(req, model({ structuredOutput: 'none' }))).toThrow('reserved');
  });

  it('caches the system prompt alone at boundary -1', () => {
    const { params } = toAnthropicCall({ ...base, cacheBoundary: -1 }, model());
    expect(params.system).toEqual([{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }]);
    expect(JSON.stringify(params.messages)).not.toContain('cache_control');
  });

  it('puts the cache point on the last block of the boundary message', () => {
    const { params } = toAnthropicCall({ ...base, cacheBoundary: 1 }, model());
    expect((params.messages[1]!.content as any[])[0].cache_control).toEqual({ type: 'ephemeral' });
    expect((params.messages[2]!.content as any[])[0].cache_control).toBeUndefined();
  });

  it('ignores the boundary for a model without prompt caching', () => {
    const { params } = toAnthropicCall({ ...base, cacheBoundary: 1 }, model({ promptCache: false }));
    expect(JSON.stringify(params)).not.toContain('cache_control');
  });

  it('rejects a boundary outside the messages', () => {
    expect(() => toAnthropicCall({ ...base, cacheBoundary: 3 }, model())).toThrow('outside');
  });

  it('sends temperature only to a model that accepts it', () => {
    expect(toAnthropicCall({ ...base, temperature: 0.2 }, model()).params.temperature).toBe(0.2);
    expect(toAnthropicCall({ ...base, temperature: 0.2 }, model({ samplingParams: false })).params.temperature).toBeUndefined();
  });
});
