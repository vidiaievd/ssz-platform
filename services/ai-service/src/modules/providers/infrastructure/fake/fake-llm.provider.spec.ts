import { SchemaGuard } from '../../application/schema-guard.js';
import { LlmError, type LlmErrorCode } from '../../domain/llm-error.js';
import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk } from '../../domain/llm-result.js';
import type { LlmModelRef, ModelFeatures } from '../../domain/model-features.js';
import { FakeLlmProvider } from './fake-llm.provider.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 4_000,
};

const model = (providerModelId = 'fake-default'): LlmModelRef => ({
  providerModelId,
  features,
  provider: { code: 'fake', baseUrl: null, apiVersion: null, credentialRef: null },
});

const answerSchema = {
  type: 'object',
  required: ['feedback', 'issues'],
  additionalProperties: false,
  properties: {
    feedback: { type: 'string', minLength: 10 },
    issues: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['severity', 'span', 'at'],
        properties: {
          at: { type: 'string', format: 'date-time' },
          severity: { type: 'string', enum: ['minor', 'major'] },
          span: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
        },
      },
    },
  },
};

function request(text: string, opts: Partial<LlmRequest> = {}): LlmRequest {
  return {
    system: 'You are a test.',
    messages: [{ role: 'user', parts: [{ type: 'text', text }] }],
    maxOutputTokens: 200,
    timeoutMs: 1000,
    ...opts,
  };
}

async function collect(stream: AsyncIterable<LlmChunk>): Promise<LlmChunk[]> {
  const out: LlmChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('FakeLlmProvider', () => {
  const fake = new FakeLlmProvider();
  const guard = new SchemaGuard();

  it('echoes the last user message when no schema is asked for', async () => {
    const res = await fake.complete(request('hello'), model());
    expect(res.output).toEqual({ kind: 'text', text: 'fake: hello' });
    expect(res.stop).toBe('end');
    expect(res.providerRequestId).toMatch(/^fake_/);
    expect(res.usage.input).toBeGreaterThan(0);
    expect(res.usage.output).toBeGreaterThan(0);
  });

  it('answers a structured request with a value the guard accepts', async () => {
    const req = request('grade it', { responseSchema: { name: 'review', schema: answerSchema } });
    const res = await fake.complete(req, model());
    expect(guard.check(res, req).isOk).toBe(true);
  });

  it('samples a template-style schema (anyOf only picks which properties are required)', async () => {
    const schema = {
      type: 'object',
      anyOf: [{ required: ['questions'] }, { required: ['question'] }],
      properties: {
        questions: { type: 'array', minItems: 1, items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
        question: { type: 'string' },
      },
    };
    const req = request('make one', { responseSchema: { name: 'mc', schema } });
    expect(guard.check(await fake.complete(req, model()), req).isOk).toBe(true);
  });

  it('calls the first tool with a sampled input', async () => {
    const tools = [
      {
        name: 'lookup_word',
        description: 'Find a word',
        inputSchema: { type: 'object', required: ['lemma'], properties: { lemma: { type: 'string' } } },
      },
    ];
    const res = await fake.complete(request('@fake:tool_call', { tools }), model());
    expect(res.stop).toBe('tool');
    expect(res.output.kind).toBe('tool_calls');
    if (res.output.kind === 'tool_calls') {
      expect(res.output.calls[0]).toMatchObject({ name: 'lookup_word', input: { lemma: 'fake' } });
    }
  });

  it.each([
    ['invalid_schema', 'invalid_response'],
    ['not_json', 'invalid_response'],
    ['truncated', 'invalid_response'],
    ['refusal', 'filtered'],
  ] as const)('scenario %s arrives as an answer the guard turns into %s', async (scenario, code) => {
    const req = request(`@fake:${scenario}`, { responseSchema: { name: 'review', schema: answerSchema } });
    const res = await fake.complete(req, model());
    const outcome = guard.check(res, req);
    expect(outcome.isFail).toBe(true);
    expect(outcome.error.code).toBe(code);
  });

  it.each([
    ['timeout', 'timeout', true],
    ['rate_limited', 'rate_limited', true],
    ['overloaded', 'overloaded', true],
    ['unavailable', 'unavailable', true],
    ['auth', 'auth', false],
    ['invalid_request', 'invalid_request', false],
  ] as const)('scenario %s throws LlmError(%s), retryable=%s', async (scenario, code, retryable) => {
    const err = await fake.complete(request(`@fake:${scenario}`), model()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe(code as LlmErrorCode);
    expect((err as LlmError).retryable).toBe(retryable);
  });

  it('slow times out when the request allows less than the wait', async () => {
    const started = Date.now();
    const err = await fake.complete(request('@fake:slow', { timeoutMs: 20 }), model()).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('timeout');
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it('gives rate_limited a retry-after hint', async () => {
    const err = (await fake.complete(request('@fake:rate_limited'), model()).catch((e) => e)) as LlmError;
    expect(err.retryAfterMs).toBe(1000);
  });

  it('takes the scenario from the model id, so two fake models fail differently', async () => {
    const err = await fake.complete(request('hello'), model('fake-rate-limited')).catch((e) => e);
    expect((err as LlmError).code).toBe('rate_limited');
    await expect(fake.complete(request('hello'), model('fake-ok'))).resolves.toMatchObject({ stop: 'end' });
  });

  it('treats a model id that names no scenario as a model that answers', async () => {
    await expect(fake.complete(request('hello'), model('fake-small'))).resolves.toMatchObject({ stop: 'end' });
  });

  it('lets a request marker override the model scenario', async () => {
    const res = await fake.complete(request('@fake:ok'), model('fake-auth'));
    expect(res.stop).toBe('end');
  });

  it('fails loudly on an unknown scenario', async () => {
    await expect(fake.complete(request('@fake:typo'), model())).rejects.toThrow('Unknown fake scenario "typo"');
  });

  it('streams the same answer in pieces and ends with the full result', async () => {
    const text = 'a fairly long message to be split into several deltas';
    const chunks = await collect(fake.stream(request(text), model()));
    const last = chunks.at(-1)!;
    expect(last.type).toBe('done');
    const deltas = chunks.filter((c) => c.type === 'text_delta');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((c) => (c.type === 'text_delta' ? c.text : '')).join('')).toBe(`fake: ${text}`);
  });

  it('streams a failure as a thrown LlmError', async () => {
    await expect(collect(fake.stream(request('@fake:overloaded'), model()))).rejects.toBeInstanceOf(LlmError);
  });
});
