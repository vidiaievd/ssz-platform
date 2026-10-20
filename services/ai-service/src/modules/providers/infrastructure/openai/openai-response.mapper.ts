import type OpenAI from 'openai';
import type { LlmOutput, LlmResult, LlmStopReason, LlmToolCall } from '../../domain/llm-result.js';
import { unfence } from '../unfence.js';
import type { OpenAiSchemaMode } from './openai-request.mapper.js';

type FinishReason = OpenAI.Chat.ChatCompletion.Choice['finish_reason'];

/** The parts of a completion this mapper reads — a merged stream is built in the same shape. */
export interface OpenAiCompletion {
  id: string;
  choices: Array<{
    finish_reason: FinishReason | null;
    message: Pick<OpenAI.Chat.ChatCompletionMessage, 'content' | 'refusal' | 'tool_calls'>;
  }>;
  usage?: OpenAI.CompletionUsage | null;
  /** The `x-request-id` header, which OpenAI support asks for; absent on many compatible servers. */
  requestId?: string | null;
}

function toStop(reason: FinishReason | null | undefined): LlmStopReason {
  switch (reason) {
    case 'length':
      return 'length';
    case 'content_filter':
      return 'filtered';
    case 'tool_calls':
    case 'function_call':
      return 'tool';
    default:
      return 'end';
  }
}

export function fromOpenAiCompletion(completion: OpenAiCompletion, mode: OpenAiSchemaMode, latencyMs: number): LlmResult {
  const choice = completion.choices[0];
  const message = choice?.message;
  const text = message?.content ?? '';
  const calls: LlmToolCall[] = (message?.tool_calls ?? [])
    .filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === 'function')
    .map((c) => ({ id: c.id, name: c.function.name, input: parseArguments(c.function.arguments) }));

  let stop: LlmStopReason;
  let output: LlmOutput;
  if (message?.refusal) {
    // Strict mode's way of declining: the refusal replaces the answer, finish_reason stays "stop".
    stop = 'refusal';
    output = { kind: 'text', text: message.refusal };
  } else if (calls.length > 0) {
    stop = 'tool';
    output = { kind: 'tool_calls', calls, ...(text ? { text } : {}) };
  } else {
    stop = toStop(choice?.finish_reason);
    // A tool-call finish with no function call in it (a custom tool we never declare).
    if (stop === 'tool') stop = 'end';
    output = { kind: 'text', text: mode === 'prompt' ? unfence(text) : text };
  }

  const usage = completion.usage;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    output,
    stop,
    usage: {
      // prompt_tokens includes the cached part; ours is the uncached rest.
      input: (usage?.prompt_tokens ?? 0) - cached,
      // completion_tokens already includes reasoning tokens.
      output: usage?.completion_tokens ?? 0,
      cacheRead: cached,
      // The automatic cache charges nothing to write.
      cacheWrite: 0,
    },
    providerRequestId: completion.requestId ?? completion.id ?? null,
    latencyMs,
  };
}

/**
 * Arguments arrive as a JSON string. One that does not parse is passed on as the raw string:
 * the agent loop validates tool input against the tool's schema and reports the mismatch
 * back to the model, which is more useful than failing the whole call here.
 */
function parseArguments(raw: string): unknown {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
