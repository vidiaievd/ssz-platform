import type Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { LlmRequest } from '../../domain/llm-request.js';
import { textOfPart } from '../../domain/llm-turns.js';
import type { LlmModelRef } from '../../domain/model-features.js';

/** Reserved tool name for the wrapper mode. Agents must not declare a tool by this name. */
export const ANSWER_TOOL = 'final_answer';

/**
 * How the response schema reaches the model:
 *  - `native` — `output_config.format` with the SDK's strict-mode rewrite of the schema;
 *  - `wrapper` — a `final_answer` tool whose input is the answer, for models without
 *    native structured output and for schemas the strict rewrite cannot express;
 *  - `none` — no schema asked for.
 * Either way `SchemaGuard` checks the answer against the original schema afterwards: the
 * strict rewrite drops constraints (`minLength`, `maximum`, most `enum`s move into the
 * description), so the provider's guarantee is weaker than ours.
 */
export type SchemaMode = 'native' | 'wrapper' | 'none';

export interface AnthropicCall {
  params: Anthropic.MessageCreateParamsNonStreaming;
  mode: SchemaMode;
}

export function toAnthropicCall(request: LlmRequest, model: LlmModelRef): AnthropicCall {
  const { cacheBoundary } = request;
  if (cacheBoundary !== undefined && (cacheBoundary < -1 || cacheBoundary >= request.messages.length)) {
    throw new Error(`cacheBoundary ${cacheBoundary} is outside the ${request.messages.length} messages`);
  }

  const messages: Anthropic.MessageParam[] = request.messages.map((m, i) => {
    const content: Anthropic.TextBlockParam[] = m.parts.map((p) => ({ type: 'text', text: textOfPart(p, 'anthropic') }));
    if (i === cacheBoundary && model.features.promptCache) {
      content[content.length - 1] = { ...content[content.length - 1]!, cache_control: { type: 'ephemeral' } };
    }
    return { role: m.role, content };
  });

  const tools: Anthropic.Tool[] = (request.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  let system = request.system;
  let mode: SchemaMode = 'none';
  let outputFormat: Anthropic.JSONOutputFormat | undefined;

  if (request.responseSchema) {
    if (tools.some((t) => t.name === ANSWER_TOOL)) {
      throw new Error(`Tool name "${ANSWER_TOOL}" is reserved by the Anthropic adapter`);
    }
    outputFormat = model.features.structuredOutput === 'native' ? strictFormat(request.responseSchema.schema) : undefined;
    if (outputFormat) {
      mode = 'native';
    } else {
      mode = 'wrapper';
      tools.push({
        name: ANSWER_TOOL,
        description: `Deliver the final answer. The input is the answer itself (${request.responseSchema.name}).`,
        input_schema: request.responseSchema.schema as Anthropic.Tool.InputSchema,
      });
      // Forced tool_choice is rejected by current models, so the prompt asks for it instead.
      system = `${system}\n\nGive your final answer by calling the \`${ANSWER_TOOL}\` tool exactly once, with the answer as its input. Do not write the answer as text.`;
    }
  }

  const cacheSystem = cacheBoundary !== undefined && model.features.promptCache;
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: model.providerModelId,
    max_tokens: request.maxOutputTokens,
    system: cacheSystem ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system,
    messages,
  };
  if (tools.length > 0) params.tools = tools;
  if (outputFormat) params.output_config = { format: outputFormat };
  if (request.temperature !== undefined && model.features.samplingParams !== false) {
    params.temperature = request.temperature;
  }

  return { params, mode };
}

/**
 * The SDK's strict-mode rewrite, or undefined when the schema cannot take it: the root must
 * be an object, and every branch of `anyOf` / `oneOf` needs its own `type` — which template
 * schemas (`type: object` + `anyOf: [{ required: [...] }]`) do not have.
 */
function strictFormat(schema: Record<string, unknown>): Anthropic.JSONOutputFormat | undefined {
  if (schema['type'] !== 'object') return undefined;
  try {
    // Loosely typed on purpose: the helper's generic infers a TS type from a literal schema,
    // which a runtime schema from the database has no use for.
    const format = (jsonSchemaOutputFormat as (s: unknown) => { schema: Record<string, unknown> })(schema);
    return { type: 'json_schema', schema: format.schema };
  } catch {
    return undefined;
  }
}
