import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk } from '../../domain/llm-result.js';
import type { LlmModelRef, ModelFeatures, ProviderConnection } from '../../domain/model-features.js';
import { AzureOpenAiLlmProvider, OpenAiCompatibleLlmProvider, OpenAiLlmProvider } from './openai-llm.provider.js';

/**
 * The real SDK against a stubbed `fetch`: checks where each kind sends the call, and that
 * a streamed answer is stitched back together the way `complete` would have returned it.
 */

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: true,
  contextWindow: 128_000,
  maxOutput: 16_000,
};

const model = (providerModelId: string, provider: Partial<ProviderConnection> = {}): LlmModelRef => ({
  providerModelId,
  features,
  provider: { code: 'p', baseUrl: null, apiVersion: null, credentialRef: 'TEST_OPENAI_KEY', ...provider },
});

const request: LlmRequest = {
  system: 'sys',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  maxOutputTokens: 100,
  timeoutMs: 5000,
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_stream' },
  });

const completion = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-5.5',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hello', refusal: null } }],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
};

async function collect(stream: AsyncIterable<LlmChunk>): Promise<LlmChunk[]> {
  const out: LlmChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('OpenAI family adapters', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['TEST_OPENAI_KEY'] = 'sk-test';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env['TEST_OPENAI_KEY'];
  });

  const call = (i = 0) => {
    const [url, init] = fetchSpy.mock.calls[i] as [string, RequestInit];
    return { url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
  };

  it('openai: api.openai.com, bearer key, request id from the header', async () => {
    fetchSpy.mockResolvedValue(json(completion, 200, { 'x-request-id': 'req_1' }));
    const result = await new OpenAiLlmProvider().complete(request, model('gpt-5.5'));

    const { url, headers, body } = call();
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.get('authorization')).toBe('Bearer sk-test');
    expect(body.max_completion_tokens).toBe(100);
    expect(result.output).toEqual({ kind: 'text', text: 'hello' });
    expect(result.providerRequestId).toBe('req_1');
  });

  it('openai: a 401 comes out as auth, with no retry', async () => {
    fetchSpy.mockResolvedValue(json({ error: { message: 'Incorrect API key', type: 'invalid_request_error', code: 'invalid_api_key' } }, 401));
    await expect(new OpenAiLlmProvider().complete(request, model('gpt-5.5'))).rejects.toMatchObject({
      code: 'auth',
      retryable: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a missing key is auth before any request is made', async () => {
    delete process.env['TEST_OPENAI_KEY'];
    await expect(new OpenAiLlmProvider().complete(request, model('gpt-5.5'))).rejects.toMatchObject({ code: 'auth' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('openai_compatible: the registry baseUrl, a placeholder key when keyless, max_tokens', async () => {
    fetchSpy.mockResolvedValue(json(completion));
    await new OpenAiCompatibleLlmProvider().complete(
      request,
      model('qwen3:8b', { baseUrl: 'http://ollama:11434/v1', credentialRef: null }),
    );

    const { url, headers, body } = call();
    expect(url).toBe('http://ollama:11434/v1/chat/completions');
    expect(headers.get('authorization')).toBe('Bearer not-needed');
    expect(body.max_tokens).toBe(100);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('openai_compatible without baseUrl is not configured', async () => {
    await expect(new OpenAiCompatibleLlmProvider().complete(request, model('m', { credentialRef: null }))).rejects.toMatchObject({
      code: 'auth',
      message: expect.stringContaining('baseUrl'),
    });
  });

  it('a refused connection to a local server is retryable unavailability', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      new OpenAiCompatibleLlmProvider().complete(request, model('m', { baseUrl: 'http://ollama:11434/v1', credentialRef: null })),
    ).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('azure_openai: deployment in the path, api-version in the query, api-key header', async () => {
    fetchSpy.mockResolvedValue(json(completion));
    await new AzureOpenAiLlmProvider().complete(
      request,
      model('my-gpt-deployment', { baseUrl: 'https://res.openai.azure.com', apiVersion: '2025-04-01-preview' }),
    );

    const { url, headers } = call();
    expect(url).toBe(
      'https://res.openai.azure.com/openai/deployments/my-gpt-deployment/chat/completions?api-version=2025-04-01-preview',
    );
    expect(headers.get('api-key')).toBe('sk-test');
  });

  it('azure_openai without apiVersion is not configured', async () => {
    await expect(
      new AzureOpenAiLlmProvider().complete(request, model('d', { baseUrl: 'https://res.openai.azure.com' })),
    ).rejects.toMatchObject({ code: 'auth', message: expect.stringContaining('apiVersion') });
  });

  it('stream: text deltas as they come, tool calls stitched from pieces, usage from the last chunk', async () => {
    const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) => ({
      id: 'chatcmpl-s',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'gpt-5.5',
      choices,
      ...extra,
    });
    fetchSpy.mockResolvedValue(
      sse([
        chunk([{ index: 0, delta: { role: 'assistant', content: 'Look' }, finish_reason: null }]),
        chunk([{ index: 0, delta: { content: 'ing up.' }, finish_reason: null }]),
        chunk([
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":' } }] },
            finish_reason: null,
          },
        ]),
        chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"hus"}' } }] }, finish_reason: null }]),
        chunk([{ index: 0, delta: {}, finish_reason: 'tool_calls' }]),
        chunk([], {
          usage: { prompt_tokens: 50, completion_tokens: 9, total_tokens: 59, prompt_tokens_details: { cached_tokens: 30 } },
        }),
      ]),
    );

    const chunks = await collect(new OpenAiLlmProvider().stream(request, model('gpt-5.5')));
    expect(call().body).toMatchObject({ stream: true, stream_options: { include_usage: true } });

    expect(chunks.slice(0, 2)).toEqual([
      { type: 'text_delta', text: 'Look' },
      { type: 'text_delta', text: 'ing up.' },
    ]);
    const toolCall = { id: 'call_1', name: 'lookup', input: { q: 'hus' } };
    expect(chunks[2]).toEqual({ type: 'tool_call', call: toolCall });

    const done = chunks[3];
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.result.stop).toBe('tool');
    expect(done.result.output).toEqual({ kind: 'tool_calls', calls: [toolCall], text: 'Looking up.' });
    expect(done.result.usage).toEqual({ input: 20, output: 9, cacheRead: 30, cacheWrite: 0 });
    expect(done.result.providerRequestId).toBe('req_stream');
  });
});
