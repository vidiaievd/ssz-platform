import type { GenerateContentConfig, GenerateContentParameters } from '@google/genai';
import type { LlmRequest } from '../../domain/llm-request.js';
import { textOfPart } from '../../domain/llm-turns.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { toGeminiSchema } from './gemini-schema.js';

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
      contents: request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.parts.map((p) => ({ text: textOfPart(p, 'google') })),
      })),
      config,
    },
    mode,
  };
}
