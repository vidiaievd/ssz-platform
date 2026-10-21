import type Anthropic from '@anthropic-ai/sdk';
import type { LlmOutput, LlmResult, LlmStopReason, LlmToolCall } from '../../domain/llm-result.js';
import { ANSWER_TOOL, type SchemaMode } from './anthropic-request.mapper.js';

const STOP: Record<Anthropic.StopReason, LlmStopReason> = {
  end_turn: 'end',
  stop_sequence: 'end',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  tool_use: 'tool',
  // Only server tools pause a turn, and this adapter declares none.
  pause_turn: 'end',
  refusal: 'refusal',
};

export function fromAnthropicMessage(message: Anthropic.Message, mode: SchemaMode, latencyMs: number): LlmResult {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const answer = mode === 'wrapper' ? toolUses.find((b) => b.name === ANSWER_TOOL) : undefined;
  const calls: LlmToolCall[] = toolUses
    .filter((b) => b.name !== ANSWER_TOOL)
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));

  let output: LlmOutput;
  let stop: LlmStopReason = message.stop_reason ? STOP[message.stop_reason] : 'end';
  if (calls.length > 0) {
    // A real tool comes first: the agent loop runs it and asks again.
    output = { kind: 'tool_calls', calls, ...(text ? { text } : {}) };
  } else if (answer) {
    // The wrapper's tool call *is* the answer, so the turn ended rather than paused.
    output = { kind: 'structured', data: answer.input };
    if (stop === 'tool') stop = 'end';
  } else {
    output = { kind: 'text', text };
  }

  const usage = message.usage;
  return {
    output,
    stop,
    usage: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
    },
    providerRequestId: (message as { _request_id?: string | null })._request_id ?? message.id,
    latencyMs,
  };
}
