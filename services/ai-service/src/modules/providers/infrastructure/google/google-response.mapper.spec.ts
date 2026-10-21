import { BlockedReason, FinishReason, type Part } from '@google/genai';
import { fromGoogleResponse, type GoogleResponse } from './google-response.mapper.js';

const usage = {
  promptTokenCount: 120,
  cachedContentTokenCount: 100,
  candidatesTokenCount: 15,
  thoughtsTokenCount: 40,
};

const response = (parts: Part[], finishReason: FinishReason = FinishReason.STOP): GoogleResponse => ({
  candidates: [{ content: { role: 'model', parts }, finishReason }],
  usageMetadata: usage,
  responseId: 'resp-1',
});

describe('fromGoogleResponse', () => {
  it('reads the answer text, skipping thought summaries', () => {
    const result = fromGoogleResponse(
      response([{ text: 'thinking…', thought: true }, { text: '{"ok":' }, { text: 'true}' }]),
      'native',
      42,
    );
    expect(result.output).toEqual({ kind: 'text', text: '{"ok":true}' });
    expect(result.stop).toBe('end');
    expect(result.providerRequestId).toBe('resp-1');
    expect(result.latencyMs).toBe(42);
  });

  it('normalizes usage: input without the cached part, thinking billed as output', () => {
    const { usage: u } = fromGoogleResponse(response([{ text: 'x' }]), 'none', 0);
    expect(u).toEqual({ input: 20, output: 55, cacheRead: 100, cacheWrite: 0 });
  });

  it('function calls become tool calls, with an id when Gemini sends none', () => {
    const result = fromGoogleResponse(
      response([{ text: 'Looking up.' }, { functionCall: { name: 'lookup', args: { q: 'hus' } } }]),
      'none',
      0,
    );
    expect(result.stop).toBe('tool');
    expect(result.output).toEqual({
      kind: 'tool_calls',
      text: 'Looking up.',
      calls: [{ id: 'call_0', name: 'lookup', input: { q: 'hus' } }],
    });
  });

  it.each([
    [FinishReason.MAX_TOKENS, 'length'],
    [FinishReason.CONTINUATION, 'length'],
    [FinishReason.SAFETY, 'filtered'],
    [FinishReason.RECITATION, 'filtered'],
    [FinishReason.PROHIBITED_CONTENT, 'filtered'],
    [FinishReason.LANGUAGE, 'refusal'],
    [FinishReason.OTHER, 'end'],
  ] as const)('finish reason %s → %s', (reason, stop) => {
    expect(fromGoogleResponse(response([{ text: '' }], reason), 'none', 0).stop).toBe(stop);
  });

  it('a blocked prompt (no candidate at all) is filtered', () => {
    const result = fromGoogleResponse(
      { promptFeedback: { blockReason: BlockedReason.SAFETY }, usageMetadata: { promptTokenCount: 5 } },
      'native',
      0,
    );
    expect(result.stop).toBe('filtered');
    expect(result.usage.input).toBe(5);
  });

  it('prompt mode unwraps a markdown fence; other modes leave the text alone', () => {
    const fenced = '```json\n{"ok":true}\n```';
    expect(fromGoogleResponse(response([{ text: fenced }]), 'prompt', 0).output).toEqual({
      kind: 'text',
      text: '{"ok":true}',
    });
    expect(fromGoogleResponse(response([{ text: fenced }]), 'json_mode', 0).output).toEqual({ kind: 'text', text: fenced });
  });
});
