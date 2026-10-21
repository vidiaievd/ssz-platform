import { fromOpenAiCompletion, type OpenAiCompletion } from './openai-response.mapper.js';

type Choice = OpenAiCompletion['choices'][number];

const completion = (message: Partial<Choice['message']>, finish: Choice['finish_reason'] = 'stop'): OpenAiCompletion => ({
  id: 'chatcmpl-1',
  choices: [{ finish_reason: finish, message: { content: null, refusal: null, ...message } }],
  usage: {
    prompt_tokens: 120,
    completion_tokens: 55,
    total_tokens: 175,
    prompt_tokens_details: { cached_tokens: 100 },
    completion_tokens_details: { reasoning_tokens: 40 },
  },
  requestId: 'req_abc',
});

describe('fromOpenAiCompletion', () => {
  it('reads the answer text and prefers the request id header over the completion id', () => {
    const result = fromOpenAiCompletion(completion({ content: '{"ok":true}' }), 'strict', 42);
    expect(result.output).toEqual({ kind: 'text', text: '{"ok":true}' });
    expect(result.stop).toBe('end');
    expect(result.providerRequestId).toBe('req_abc');
    expect(result.latencyMs).toBe(42);
    expect(fromOpenAiCompletion({ ...completion({ content: 'x' }), requestId: null }, 'none', 0).providerRequestId).toBe(
      'chatcmpl-1',
    );
  });

  it('normalizes usage: input without the cached part, reasoning already inside output', () => {
    const { usage } = fromOpenAiCompletion(completion({ content: 'x' }), 'none', 0);
    expect(usage).toEqual({ input: 20, output: 55, cacheRead: 100, cacheWrite: 0 });
  });

  it('a compatible server without usage details reports zeros, not NaN', () => {
    const { usage } = fromOpenAiCompletion({ ...completion({ content: 'x' }), usage: undefined }, 'none', 0);
    expect(usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('function calls become tool calls with parsed arguments', () => {
    const result = fromOpenAiCompletion(
      completion(
        {
          content: 'Looking up.',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"hus"}' } }],
        },
        'tool_calls',
      ),
      'none',
      0,
    );
    expect(result.stop).toBe('tool');
    expect(result.output).toEqual({
      kind: 'tool_calls',
      calls: [{ id: 'call_1', name: 'lookup', input: { q: 'hus' } }],
      text: 'Looking up.',
    });
  });

  it('arguments that do not parse are passed on raw; empty ones become {}', () => {
    const result = fromOpenAiCompletion(
      completion(
        {
          tool_calls: [
            { id: 'a', type: 'function', function: { name: 'f', arguments: '{"q":' } },
            { id: 'b', type: 'function', function: { name: 'g', arguments: '' } },
          ],
        },
        'tool_calls',
      ),
      'none',
      0,
    );
    expect(result.output).toEqual({
      kind: 'tool_calls',
      calls: [
        { id: 'a', name: 'f', input: '{"q":' },
        { id: 'b', name: 'g', input: {} },
      ],
    });
  });

  it('a strict-mode refusal is a refusal, whatever the finish reason says', () => {
    const result = fromOpenAiCompletion(completion({ refusal: 'I cannot help with that.' }), 'strict', 0);
    expect(result.stop).toBe('refusal');
    expect(result.output).toEqual({ kind: 'text', text: 'I cannot help with that.' });
  });

  it.each([
    ['length', 'length'],
    ['content_filter', 'filtered'],
    ['stop', 'end'],
    [null, 'end'],
  ] as const)('finish_reason %s → %s', (finish, stop) => {
    expect(fromOpenAiCompletion(completion({ content: 'x' }, finish), 'none', 0).stop).toBe(stop);
  });

  it('strips a markdown fence only in prompt mode', () => {
    const fenced = '```json\n{"ok":true}\n```';
    expect(fromOpenAiCompletion(completion({ content: fenced }), 'prompt', 0).output).toEqual({
      kind: 'text',
      text: '{"ok":true}',
    });
    expect(fromOpenAiCompletion(completion({ content: fenced }), 'loose', 0).output).toEqual({ kind: 'text', text: fenced });
  });

  it('no choices at all reads as an empty answer', () => {
    const result = fromOpenAiCompletion({ id: 'x', choices: [] }, 'none', 0);
    expect(result.output).toEqual({ kind: 'text', text: '' });
    expect(result.stop).toBe('end');
  });
});
