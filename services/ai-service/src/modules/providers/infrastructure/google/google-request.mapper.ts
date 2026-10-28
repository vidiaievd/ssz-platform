import type { Content, GenerateContentConfig, GenerateContentParameters, Part } from '@google/genai';
import { LlmError } from '../../domain/llm-error.js';
import type { LlmMessage, LlmPart, LlmRequest } from '../../domain/llm-request.js';
import { toolTurnProblem } from '../../domain/llm-turns.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { toGeminiSchema } from './gemini-schema.js';

/**
 * Prefix of the call ids this adapter makes up when Gemini sends none (the Gemini API mostly
 * does not). Such an id never goes back to Gemini: calls and responses then pair by order.
 */
export const SYNTHETIC_CALL_ID = 'gemini_call_';

/**
 * Google's documented stand-in signature for function calls Gemini did not write itself
 * (a fallback from another provider mid-loop): Gemini 3 rejects an unsigned function call
 * in the current turn, and a real signature only exists in a turn it produced.
 */
export const FOREIGN_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

/**
 * How the response schema reaches Gemini:
 *  - `native` — `responseJsonSchema` with the downgraded schema (see `gemini-schema.ts`);
 *  - `json_mode` — JSON mime type plus the full schema in the system instruction, when the
 *    model has no native mode or the schema does not downgrade without losing its shape;
 *  - `prompt` — the schema in the system instruction only: with tools declared (Gemini 2.5
 *    cannot combine function calling with a JSON response) or a model that does neither;
 *  - `none` — no schema asked for.
 * `SchemaGuard` checks the answer against the original schema in every mode.
 */
export type GoogleSchemaMode = 'native' | 'json_mode' | 'prompt' | 'none';

export interface GoogleCall {
  params: GenerateContentParameters;
  mode: GoogleSchemaMode;
}

/**
 * `cacheBoundary` is ignored: Gemini caches a repeated prefix implicitly, and the explicit
 * cache is a separate resource with its own lifecycle and storage fee — not worth it until
 * an agent shows a prefix big and hot enough. Cache hits still come back in `usage`.
 */
export function toGoogleCall(request: LlmRequest, model: LlmModelRef): GoogleCall {
  const problem = toolTurnProblem(request.messages);
  if (problem) throw new LlmError('invalid_request', `google: ${problem}`);

  const tools = request.tools ?? [];
  let system = request.system;
  let mode: GoogleSchemaMode = 'none';

  const config: GenerateContentConfig = {
    maxOutputTokens: request.maxOutputTokens,
    httpOptions: { timeout: request.timeoutMs },
    // The router owns retries and continuations: each is another billed request.
    automaticContinuation: false,
    automaticFunctionCalling: { disable: true },
  };

  if (request.responseSchema) {
    const { name, schema } = request.responseSchema;
    const structured = model.features.structuredOutput;
    const downgraded = structured === 'native' && tools.length === 0 ? toGeminiSchema(schema) : undefined;

    if (downgraded?.ok) {
      mode = 'native';
      config.responseMimeType = 'application/json';
      config.responseJsonSchema = downgraded.schema;
    } else {
      mode = structured !== 'none' && tools.length === 0 ? 'json_mode' : 'prompt';
      if (mode === 'json_mode') config.responseMimeType = 'application/json';
      system = `${system}\n\nGive your final answer as a single JSON value (${name}) that satisfies this JSON Schema, with nothing before or after it:\n${JSON.stringify(schema)}`;
    }
  }

  config.systemInstruction = system;
  if (tools.length > 0) {
    config.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.inputSchema,
        })),
      },
    ];
  }
  if (request.temperature !== undefined && model.features.samplingParams !== false) {
    config.temperature = request.temperature;
  }

  return {
    params: {
      model: model.providerModelId,
      contents: request.messages.map((m, i) => toContent(m, request.messages[i - 1], model)),
      config,
    },
    mode,
  };
}

/**
 * A model turn Gemini produced on this model is replayed as it came — thought signatures
 * are only accepted verbatim, on the parts that carried them. Anything else is mapped from
 * the parts, `functionResponse`s first (they answer the turn right before).
 */
function toContent(message: LlmMessage, previous: LlmMessage | undefined, model: LlmModelRef): Content {
  const role = message.role === 'assistant' ? 'model' : 'user';
  const { native } = message;
  if (
    native?.provider === 'google' &&
    native.providerModelId === model.providerModelId &&
    Array.isArray(native.data) &&
    native.data.length > 0
  ) {
    return { role, parts: native.data as Part[] };
  }

  // functionResponse needs the function's name, which only the call it answers holds.
  const names = new Map(previous?.parts.flatMap((p) => (p.type === 'tool_call' ? [[p.id, p.name] as const] : [])) ?? []);
  const results = message.parts.filter((p) => p.type === 'tool_result');
  const rest = message.parts.filter((p) => p.type !== 'tool_result');
  let signed = false;
  const parts = [...results, ...rest].map((p) => {
    const part = toPart(p, names);
    // The signature goes on the first call of the turn only, as Gemini itself places it.
    if (p.type === 'tool_call' && !signed) {
      signed = true;
      return { ...part, thoughtSignature: FOREIGN_THOUGHT_SIGNATURE };
    }
    return part;
  });
  return { role, parts };
}

function toPart(part: LlmPart, names: ReadonlyMap<string, string>): Part {
  switch (part.type) {
    case 'text':
      return { text: part.text };
    case 'tool_call':
      return { functionCall: { ...idOf(part.id), name: part.name, args: argsOf(part.input) } };
    case 'tool_result':
      return {
        functionResponse: {
          ...idOf(part.callId),
          name: names.get(part.callId) ?? '',
          // Gemini reads `output`, or `error` for a failed call.
          response: part.isError ? { error: part.content } : { output: part.content },
        },
      };
  }
}

function idOf(id: string): { id?: string } {
  return id.startsWith(SYNTHETIC_CALL_ID) ? {} : { id };
}

/** `args` must be an object; input that did not parse arrives as a string or a scalar. */
function argsOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : { input };
}
