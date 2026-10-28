import type OpenAI from 'openai';
import { toStrictJsonSchema } from 'openai/lib/transform';
import type { LlmMessage, LlmRequest } from '../../domain/llm-request.js';
import { textOfPart } from '../../domain/llm-turns.js';
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
 * cached part comes back in `usage`.
 */
export function toOpenAiCall(request: LlmRequest, model: LlmModelRef, kind: ProviderKind): OpenAiCall {
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
    messages: [{ role: 'system', content: system }, ...request.messages.map(toMessage)],
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

function toMessage(message: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
  // A lone text part goes as a plain string — the form every compatible server accepts.
  const content =
    message.parts.length === 1
      ? textOfPart(message.parts[0]!, 'openai')
      : message.parts.map((p) => ({ type: 'text' as const, text: textOfPart(p, 'openai') }));
  return message.role === 'assistant' ? { role: 'assistant', content } : { role: 'user', content };
}

/** The SDK's strict-mode normalization, or undefined when the schema cannot take it. */
function strictSchema(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    return toStrictJsonSchema(schema) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
