import { BlockedReason, FinishReason, type Part } from '@google/genai';
import type { GoogleSchemaMode } from './google-request.mapper.js';
import { fromGoogleResponse as fromGoogle, type GoogleResponse } from './google-response.mapper.js';

const fromGoogleResponse = (r: GoogleResponse, mode: GoogleSchemaMode, latencyMs: number) =>
  fromGoogle(r, mode, latencyMs, 'gemini-2.5-flash');

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
    expect(result.output).toMatchObject({
      kind: 'tool_calls',
      text: 'Looking up.',
      calls: [{ id: 'gemini_call_0', name: 'lookup', input: { q: 'hus' } }],
    });
  });

  it('keeps every part of a tool turn, signatures and thoughts included, as the native form', () => {
    const parts: Part[] = [
      { text: 'plan', thought: true },
      { functionCall: { id: 'fc-1', name: 'lookup', args: { q: 'hus' } }, thoughtSignature: 'sig-1' },
      { functionCall: { name: 'lookup', args: { q: 'bil' } } },
    ];
    const result = fromGoogleResponse(response(parts), 'none', 0);
    expect(result.output).toMatchObject({
      kind: 'tool_calls',
      calls: [{ id: 'fc-1' }, { id: 'gemini_call_1' }],
      native: { provider: 'google', providerModelId: 'gemini-2.5-flash', data: parts },
    });
  });

  it('keeps no native form for an answer', () => {
    expect(fromGoogleResponse(response([{ text: 'hi' }]), 'none', 0).output).not.toHaveProperty('native');
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
