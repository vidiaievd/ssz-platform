import { LlmError } from './llm-error.js';
import type { LlmMessage } from './llm-request.js';
import { assistantToolTurn, textOfPart, toolResultsTurn, toolTurnProblem } from './llm-turns.js';

const user = (text: string): LlmMessage => ({ role: 'user', parts: [{ type: 'text', text }] });

describe('llm turns', () => {
  const round = {
    kind: 'tool_calls' as const,
    text: 'Let me look.',
    calls: [
      { id: 'c1', name: 'get_rule', input: { ruleId: 'r1' } },
      { id: 'c2', name: 'lookup_word', input: { lemma: 'bil' } },
    ],
    native: { provider: 'google' as const, providerModelId: 'gemini-x', data: { parts: [] } },
  };

  it('records a tool round as text, then the calls, keeping the native turn', () => {
    expect(assistantToolTurn(round)).toEqual({
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Let me look.' },
        { type: 'tool_call', id: 'c1', name: 'get_rule', input: { ruleId: 'r1' } },
        { type: 'tool_call', id: 'c2', name: 'lookup_word', input: { lemma: 'bil' } },
      ],
      native: round.native,
    });
  });

  it('answers the round in one user message, flagging only the failures', () => {
    expect(
      toolResultsTurn([
        { callId: 'c1', content: '{"title":"Kjønn"}' },
        { callId: 'c2', content: 'not_found', isError: true },
      ]),
    ).toEqual({
      role: 'user',
      parts: [
        { type: 'tool_result', callId: 'c1', content: '{"title":"Kjønn"}' },
        { type: 'tool_result', callId: 'c2', content: 'not_found', isError: true },
      ],
    });
  });

  describe('toolTurnProblem', () => {
    const answered = toolResultsTurn([
      { callId: 'c1', content: 'a' },
      { callId: 'c2', content: 'b' },
    ]);

    it('accepts text-only histories and paired rounds', () => {
      expect(toolTurnProblem([user('hi'), { role: 'assistant', parts: [{ type: 'text', text: 'hey' }] }])).toBeNull();
      expect(toolTurnProblem([user('q'), assistantToolTurn(round), answered])).toBeNull();
    });

    it('flags a call left unanswered, also on the last message', () => {
      const partial = toolResultsTurn([{ callId: 'c1', content: 'a' }]);
      expect(toolTurnProblem([user('q'), assistantToolTurn(round), partial])).toMatch(/c2 has no result/);
      expect(toolTurnProblem([user('q'), assistantToolTurn(round)])).toMatch(/c1 has no result/);
    });

    it('flags a result answering no call of the previous message, or answered twice', () => {
      expect(toolTurnProblem([user('q'), toolResultsTurn([{ callId: 'c1', content: 'a' }])])).toMatch(/answers no call/);
      const twice = toolResultsTurn([
        { callId: 'c1', content: 'a' },
        { callId: 'c1', content: 'a' },
        { callId: 'c2', content: 'b' },
      ]);
      expect(toolTurnProblem([user('q'), assistantToolTurn(round), twice])).toMatch(/answered twice/);
    });

    it('flags tool parts in the wrong role', () => {
      const callAsUser: LlmMessage = { role: 'user', parts: [{ type: 'tool_call', id: 'c', name: 'x', input: {} }] };
      expect(toolTurnProblem([callAsUser])).toMatch(/outside an assistant message/);
    });
  });

  it('textOfPart raises invalid_request for a tool part', () => {
    expect(textOfPart({ type: 'text', text: 'a' }, 'anthropic')).toBe('a');
    const call = () => textOfPart({ type: 'tool_result', callId: 'c', content: 'x' }, 'anthropic');
    expect(call).toThrow(LlmError);
    expect(call).toThrow(/anthropic: tool_result parts/);
  });
});
