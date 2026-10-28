import { LlmError } from './llm-error.js';
import type { LlmMessage, LlmPart } from './llm-request.js';
import type { LlmOutput } from './llm-result.js';

/** What one tool run gave back, for the next round of an agent loop. */
export interface LlmToolOutcome {
  callId: string;
  content: string;
  isError?: boolean;
}

/**
 * The assistant message that records a tool round: the calls (and any text the model wrote
 * beside them), plus the provider's own form of the turn when the adapter kept one.
 */
export function assistantToolTurn(output: Extract<LlmOutput, { kind: 'tool_calls' }>): LlmMessage {
  const parts: LlmPart[] = [];
  if (output.text) parts.push({ type: 'text', text: output.text });
  for (const call of output.calls) parts.push({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
  return { role: 'assistant', parts, ...(output.native ? { native: output.native } : {}) };
}

/** The user message answering a tool round — one result per call, in the calls' order. */
export function toolResultsTurn(outcomes: LlmToolOutcome[]): LlmMessage {
  return {
    role: 'user',
    parts: outcomes.map((o) => ({
      type: 'tool_result',
      callId: o.callId,
      content: o.content,
      ...(o.isError ? { isError: true } : {}),
    })),
  };
}

/**
 * The text of a part, for an adapter that does not map tool turns (plan 83: 4b–4d add them
 * one adapter at a time). Raised as `invalid_request` so the router does not try a fallback
 * that would fail the same way.
 */
export function textOfPart(part: LlmPart, adapter: string): string {
  if (part.type === 'text') return part.text;
  throw new LlmError('invalid_request', `${adapter}: ${part.type} parts are not supported by this adapter`);
}

/**
 * Checks that every `tool_result` answers a `tool_call` of the assistant message right before
 * it, and that every call is answered there — the pairing every provider enforces with a 400.
 * Returns why the history is malformed, or null.
 */
export function toolTurnProblem(messages: LlmMessage[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    const calls = message.parts.filter((p) => p.type === 'tool_call');
    const results = message.parts.filter((p) => p.type === 'tool_result');

    if (calls.length > 0 && message.role !== 'assistant') return `message ${i}: tool_call outside an assistant message`;
    if (results.length > 0) {
      if (message.role !== 'user') return `message ${i}: tool_result outside a user message`;
      const previous = messages[i - 1];
      const asked = new Set(previous?.parts.flatMap((p) => (p.type === 'tool_call' ? [p.id] : [])) ?? []);
      const answered = new Set<string>();
      for (const r of results) {
        if (!asked.has(r.callId)) return `message ${i}: tool_result ${r.callId} answers no call of the previous message`;
        if (answered.has(r.callId)) return `message ${i}: tool_result ${r.callId} answered twice`;
        answered.add(r.callId);
      }
    }
    if (calls.length > 0) {
      const answered = new Set(messages[i + 1]?.parts.flatMap((p) => (p.type === 'tool_result' ? [p.callId] : [])) ?? []);
      const open = calls.find((c) => !answered.has(c.id));
      if (open) return `message ${i}: tool_call ${open.id} has no result in the next message`;
    }
  }
  return null;
}
