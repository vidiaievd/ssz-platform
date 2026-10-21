import type Anthropic from '@anthropic-ai/sdk';
import { ANSWER_TOOL } from './anthropic-request.mapper.js';
import { fromAnthropicMessage } from './anthropic-response.mapper.js';

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
    const r = fromAnthropicMessage(
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
    const r = fromAnthropicMessage(
      message([{ type: 'tool_use', id: 't1', name: ANSWER_TOOL, input: { ok: true } }], 'tool_use'),
      'wrapper',
      1,
    );
    expect(r.output).toEqual({ kind: 'structured', data: { ok: true } });
    expect(r.stop).toBe('end');
  });

  it('returns real tool calls with any text, leaving the answer tool out', () => {
    const r = fromAnthropicMessage(
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
    expect(r.output).toEqual({ kind: 'tool_calls', calls: [{ id: 't1', name: 'lookup', input: { q: 'x' } }], text: 'Looking it up.' });
    expect(r.stop).toBe('tool');
  });

  it('does not treat an answer-tool name as the answer outside wrapper mode', () => {
    const r = fromAnthropicMessage(message([{ type: 'text', text: 'hi' }], 'end_turn'), 'none', 1);
    expect(r.output).toEqual({ kind: 'text', text: 'hi' });
  });

  it.each([
    ['max_tokens', 'length'],
    ['model_context_window_exceeded', 'length'],
    ['refusal', 'refusal'],
    ['stop_sequence', 'end'],
  ] as const)('maps stop reason %s to %s', (stop, expected) => {
    expect(fromAnthropicMessage(message([], stop), 'none', 1).stop).toBe(expected);
  });

  it('reports cache tokens apart from uncached input', () => {
    const r = fromAnthropicMessage(
      message([], 'end_turn', { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }),
      'none',
      1,
    );
    expect(r.usage).toEqual({ input: 10, output: 7, cacheRead: 900, cacheWrite: 50 });
  });

  it('prefers the HTTP request id when the SDK attached one', () => {
    const m = message([], 'end_turn');
    Object.defineProperty(m, '_request_id', { value: 'req_9', enumerable: false });
    expect(fromAnthropicMessage(m, 'none', 1).providerRequestId).toBe('req_9');
  });
});
