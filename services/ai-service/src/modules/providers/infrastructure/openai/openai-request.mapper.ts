import type OpenAI from 'openai';
import { toStrictJsonSchema } from 'openai/lib/transform';
import { LlmError } from '../../domain/llm-error.js';
import type { LlmMessage, LlmPart, LlmRequest } from '../../domain/llm-request.js';
import { toolTurnProblem } from '../../domain/llm-turns.js';
import type { LlmModelRef, ProviderKind } from '../../domain/model-features.js';

/**
 * How the response schema reaches the model:
 *  - `strict` — `json_schema` with `strict: true`: the provider enforces the shape. Only for
 *    schemas the SDK's strict rewrite accepts unchanged — every property required, objects
 *    closed, an object root without a union;
 *  - `loose` — `json_schema` with `strict: false`, for a `native` model and a schema strict
 *    mode cannot express (template schemas: optional properties, `anyOf` branches without
 *    a `type`). The model is steered by the schema but nothing is enforced;
 *  - `json_mode` — `json_object` plus the schema in the system prompt;
 *  - `prompt` — the schema in the system prompt only, for a model that does neither;
 *  - `none` — no schema asked for.
 * `SchemaGuard` checks the answer against the original schema in every mode.
 *
 * Strict mode is not reached by rewriting optional properties into required nullable ones:
 * the model would then answer `null` where the schema says "absent", and the answer would
 * have to be un-rewritten before `SchemaGuard` — a second schema walker for one provider.
 */
export type OpenAiSchemaMode = 'strict' | 'loose' | 'json_mode' | 'prompt' | 'none';

export interface OpenAiCall {
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  mode: OpenAiSchemaMode;
}

/**
 * Chat Completions, not the Responses API: it is the one dialect OpenAI, Azure and every
 * OpenAI-compatible server (Ollama, vLLM, LM Studio, OpenRouter) all speak.
 *
 * `cacheBoundary` is ignored: OpenAI caches a repeated prefix automatically, and the
 * cached part comes back in `usage`. A message's `native` form is ignored too: Chat
 * Completions keeps no state of its own between turns, so the parts are the whole turn.
 */
export function toOpenAiCall(request: LlmRequest, model: LlmModelRef, kind: ProviderKind): OpenAiCall {
  const problem = toolTurnProblem(request.messages);
  if (problem) throw new LlmError('invalid_request', `openai: ${problem}`);

  let system = request.system;
  let mode: OpenAiSchemaMode = 'none';
  let responseFormat: OpenAiCall['params']['response_format'];

  if (request.responseSchema) {
    const { name, schema } = request.responseSchema;
    const structured = model.features.structuredOutput;
    const strict = structured === 'native' ? strictSchema(schema) : undefined;

    if (strict) {
      mode = 'strict';
      responseFormat = { type: 'json_schema', json_schema: { name, schema: strict, strict: true } };
    } else if (structured === 'native') {
      mode = 'loose';
      responseFormat = { type: 'json_schema', json_schema: { name, schema, strict: false } };
    } else {
      mode = structured === 'json_mode' ? 'json_mode' : 'prompt';
      // `json_object` also requires the word "JSON" somewhere in the messages — this is it.
      if (mode === 'json_mode') responseFormat = { type: 'json_object' };
      system = `${system}\n\nGive your final answer as a single JSON value (${name}) that satisfies this JSON Schema, with nothing before or after it:\n${JSON.stringify(schema)}`;
    }
  }

  const params: OpenAiCall['params'] = {
    model: model.providerModelId,
    messages: [{ role: 'system', content: system }, ...request.messages.flatMap(toMessages)],
  };

  // OpenAI and Azure renamed the limit (reasoning models reject `max_tokens`); compatible
  // servers are not all there yet, and every one of them still reads the old name.
  if (kind === 'openai_compatible') params.max_tokens = request.maxOutputTokens;
  else params.max_completion_tokens = request.maxOutputTokens;

  if (responseFormat) params.response_format = responseFormat;
  if (request.tools && request.tools.length > 0) {
    params.tools = request.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }
  if (request.temperature !== undefined && model.features.samplingParams !== false) {
    params.temperature = request.temperature;
  }

  return { params, mode };
}

/**
 * One message of ours is one message of theirs, except tool results: each is a `role: 'tool'`
 * message of its own, right after the assistant message that asked — so they come before
 * any text the user message carries beside them.
 */
function toMessages(message: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam[] {
  const texts = message.parts.filter((p): p is Extract<LlmPart, { type: 'text' }> => p.type === 'text');

  if (message.role === 'assistant') {
    const calls = message.parts.filter((p): p is Extract<LlmPart, { type: 'tool_call' }> => p.type === 'tool_call');
    if (calls.length === 0) return [{ role: 'assistant', content: textContent(texts) }];
    return [
      {
        role: 'assistant',
        content: texts.length > 0 ? textContent(texts) : null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function',
          // Arguments that did not parse came back as the raw string; they go back as they were.
          function: { name: c.name, arguments: typeof c.input === 'string' ? c.input : JSON.stringify(c.input) },
        })),
      },
    ];
  }

  const results = message.parts.filter((p): p is Extract<LlmPart, { type: 'tool_result' }> => p.type === 'tool_result');
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = results.map((r) => ({
    role: 'tool',
    tool_call_id: r.callId,
    // The API has no error flag on a tool message, so the model reads it in the content.
    content: r.isError ? `Error: ${r.content}` : r.content,
  }));
  if (texts.length > 0 || results.length === 0) out.push({ role: 'user', content: textContent(texts) });
  return out;
}

/** A lone text part goes as a plain string — the form every compatible server accepts. */
function textContent(texts: Array<{ text: string }>): string | Array<{ type: 'text'; text: string }> {
  return texts.length === 1 ? texts[0]!.text : texts.map((t) => ({ type: 'text' as const, text: t.text }));
}

/** The SDK's strict-mode normalization, or undefined when the schema cannot take it. */
function strictSchema(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    return toStrictJsonSchema(schema) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
