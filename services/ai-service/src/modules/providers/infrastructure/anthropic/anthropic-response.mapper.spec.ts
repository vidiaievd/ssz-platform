import type Anthropic from '@anthropic-ai/sdk';
import { ANSWER_TOOL, type SchemaMode } from './anthropic-request.mapper.js';
import { fromAnthropicMessage } from './anthropic-response.mapper.js';

const fromMessage = (m: Anthropic.Message, mode: SchemaMode, latencyMs: number) =>
  fromAnthropicMessage(m, mode, latencyMs, 'claude-sonnet-5-5');

function message(content: unknown[], stop: Anthropic.StopReason, usage: Partial<Anthropic.Usage> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 30,
      output_tokens: 7,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      ...usage,
    },
  } as unknown as Anthropic.Message;
}

describe('fromAnthropicMessage', () => {
  it('joins text blocks and skips thinking', () => {
    const r = fromMessage(
      message(
        [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'text', text: '{"a":' },
          { type: 'text', text: '1}' },
        ],
        'end_turn',
      ),
      'native',
      12,
    );
    expect(r.output).toEqual({ kind: 'text', text: '{"a":1}' });
    expect(r.stop).toBe('end');
    expect(r.latencyMs).toBe(12);
    expect(r.providerRequestId).toBe('msg_1');
  });

  it('turns the answer tool into a structured answer that ended the turn', () => {
    const r = fromMessage(
      message([{ type: 'tool_use', id: 't1', name: ANSWER_TOOL, input: { ok: true } }], 'tool_use'),
      'wrapper',
      1,
    );
    expect(r.output).toEqual({ kind: 'structured', data: { ok: true } });
    expect(r.stop).toBe('end');
  });

  it('returns real tool calls with any text, leaving the answer tool out', () => {
    const r = fromMessage(
      message(
        [
          { type: 'text', text: 'Looking it up.' },
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
        ],
        'tool_use',
      ),
      'wrapper',
      1,
    );
    expect(r.output).toMatchObject({
      kind: 'tool_calls',
      calls: [{ id: 't1', name: 'lookup', input: { q: 'x' } }],
      text: 'Looking it up.',
    });
    expect(r.stop).toBe('tool');
  });

  it('keeps the whole turn, thinking included, as the native form under the requested model id', () => {
    const content = [
      { type: 'thinking', thinking: 'plan', signature: 'sig' },
      { type: 'text', text: 'Looking it up.' },
      { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
    ];
    const r = fromAnthropicMessage(
      { ...message(content, 'tool_use'), model: 'claude-sonnet-5-5-20261001' } as Anthropic.Message,
      'none',
      1,
      'claude-sonnet-5-5',
    );
    expect(r.output).toMatchObject({
      kind: 'tool_calls',
      native: { provider: 'anthropic', providerModelId: 'claude-sonnet-5-5', data: content },
    });
  });

  it('drops a premature answer-tool call beside real calls from both the calls and the native turn', () => {
    const r = fromMessage(
      message(
        [
          { type: 'tool_use', id: 't1', name: 'lookup', input: {} },
          { type: 'tool_use', id: 't2', name: ANSWER_TOOL, input: { ok: true } },
        ],
        'tool_use',
      ),
      'wrapper',
      1,
    );
    expect(r.output.kind).toBe('tool_calls');
    if (r.output.kind !== 'tool_calls') return;
    expect(r.output.calls.map((c) => c.id)).toEqual(['t1']);
    expect(r.output.native?.data).toEqual([{ type: 'tool_use', id: 't1', name: 'lookup', input: {} }]);
  });

  it('keeps no native form for an answer', () => {
    const r = fromMessage(message([{ type: 'text', text: 'hi' }], 'end_turn'), 'none', 1);
    expect(r.output).not.toHaveProperty('native');
  });

  it('does not treat an answer-tool name as the answer outside wrapper mode', () => {
    const r = fromMessage(message([{ type: 'text', text: 'hi' }], 'end_turn'), 'none', 1);
    expect(r.output).toEqual({ kind: 'text', text: 'hi' });
  });

  it.each([
    ['max_tokens', 'length'],
    ['model_context_window_exceeded', 'length'],
    ['refusal', 'refusal'],
    ['stop_sequence', 'end'],
  ] as const)('maps stop reason %s to %s', (stop, expected) => {
    expect(fromMessage(message([], stop), 'none', 1).stop).toBe(expected);
  });

  it('reports cache tokens apart from uncached input', () => {
    const r = fromMessage(
      message([], 'end_turn', { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }),
      'none',
      1,
    );
    expect(r.usage).toEqual({ input: 10, output: 7, cacheRead: 900, cacheWrite: 50 });
  });

  it('prefers the HTTP request id when the SDK attached one', () => {
    const m = message([], 'end_turn');
    Object.defineProperty(m, '_request_id', { value: 'req_9', enumerable: false });
    expect(fromMessage(m, 'none', 1).providerRequestId).toBe('req_9');
  });
});
