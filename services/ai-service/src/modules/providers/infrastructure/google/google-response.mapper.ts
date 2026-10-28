import { FinishReason, type GenerateContentResponse, type Part } from '@google/genai';
import type { LlmOutput, LlmResult, LlmStopReason, LlmToolCall } from '../../domain/llm-result.js';
import { unfence } from '../unfence.js';
import { SYNTHETIC_CALL_ID, type GoogleSchemaMode } from './google-request.mapper.js';

/** The fields of a response this mapper reads — a merged stream produces the same shape. */
export type GoogleResponse = Pick<GenerateContentResponse, 'candidates' | 'usageMetadata' | 'responseId' | 'promptFeedback'>;

const FILTERED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
  FinishReason.IMAGE_RECITATION,
]);

function toStop(reason: FinishReason | undefined): LlmStopReason {
  if (reason === undefined) return 'end';
  if (FILTERED.has(reason)) return 'filtered';
  // Continuation is off, so a response that would continue is simply cut short.
  if (reason === FinishReason.MAX_TOKENS || reason === FinishReason.CONTINUATION) return 'length';
  // The model declined to answer in the language asked for.
  if (reason === FinishReason.LANGUAGE) return 'refusal';
  // STOP, OTHER, and the tool-call misfires: whatever arrived is judged on its content.
  return 'end';
}

/** Text the model meant as its answer: thought summaries are not part of it. */
export function answerText(parts: Part[] | undefined): string {
  return (parts ?? [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text!)
    .join('');
}

/**
 * `providerModelId` — the id the request named, which a replayed turn is matched against on
 * the next round (`modelVersion` in the response may name the model differently).
 */
export function fromGoogleResponse(
  response: GoogleResponse,
  mode: GoogleSchemaMode,
  latencyMs: number,
  providerModelId: string,
): LlmResult {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const text = answerText(parts);
  const calls: LlmToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      // The Gemini API leaves the id out; it only has to be unique within this turn.
      id: p.functionCall!.id ?? `${SYNTHETIC_CALL_ID}${i}`,
      name: p.functionCall!.name ?? '',
      input: p.functionCall!.args ?? {},
    }));

  let stop: LlmStopReason;
  let output: LlmOutput;
  if (!candidate && response.promptFeedback?.blockReason) {
    // The prompt itself was blocked: no candidate at all.
    stop = 'filtered';
    output = { kind: 'text', text: '' };
  } else if (calls.length > 0) {
    stop = 'tool';
    // All the parts, thought signatures included: the next round replays them as they are.
    output = {
      kind: 'tool_calls',
      calls,
      ...(text ? { text } : {}),
      native: { provider: 'google', providerModelId, data: parts },
    };
  } else {
    stop = toStop(candidate?.finishReason);
    output = { kind: 'text', text: mode === 'prompt' ? unfence(text) : text };
  }

  const usage = response.usageMetadata;
  const cached = usage?.cachedContentTokenCount ?? 0;
  return {
    output,
    stop,
    usage: {
      // promptTokenCount includes the cached part; ours is the uncached rest.
      input: (usage?.promptTokenCount ?? 0) - cached + (usage?.toolUsePromptTokenCount ?? 0),
      // Thinking is billed as output.
      output: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      cacheRead: cached,
      // The implicit cache charges nothing to write.
      cacheWrite: 0,
    },
    providerRequestId: response.responseId ?? null,
    latencyMs,
  };
}
