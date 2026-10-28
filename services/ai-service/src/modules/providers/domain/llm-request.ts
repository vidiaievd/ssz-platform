/**
 * A provider-neutral model call. Every adapter translates this into its own SDK's shape;
 * nothing above `providers` ever sees a vendor type.
 */

import type { ProviderKind } from './model-features.js';

/**
 * One piece of a message. Images and audio join this union when an agent needs them.
 *
 * Tool turns (plan 83, step 4): an assistant message carries the model's `tool_call`s, the
 * next user message the matching `tool_result`s — one per call, `callId` = the call's `id`.
 * Adapters whose API has a separate tool role (OpenAI) split that message themselves.
 */
export type LlmPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  /** `content` is what the model reads — the tool's answer serialized, or why it failed. */
  | { type: 'tool_result'; callId: string; content: string; isError?: boolean };

/**
 * A model turn exactly as the provider returned it, to be sent back unchanged: Gemini's
 * thought signatures and Anthropic's thinking blocks are only accepted verbatim, by the
 * model that produced them. The adapter of that provider and model replays `data` in place
 * of the message's parts; any other adapter (a fallback mid-loop) ignores it and maps the
 * parts. Nothing outside the adapter that wrote `data` reads it.
 */
export interface LlmNativeTurn {
  provider: ProviderKind;
  providerModelId: string;
  data: unknown;
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  parts: LlmPart[];
  /** Assistant messages only: the provider's own form of the same turn. */
  native?: LlmNativeTurn;
}

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema of the tool's input. */
  inputSchema: Record<string, unknown>;
}

export interface LlmResponseSchema {
  /** Short identifier some providers require for a named schema (letters, digits, `_`). */
  name: string;
  /** JSON Schema the answer must satisfy — checked by `SchemaGuard` whatever the provider claims. */
  schema: Record<string, unknown>;
  /**
   * What JSON Schema cannot say about the answer — e.g. that a quoted fragment really occurs
   * in the learner's text. Runs after the schema check, on the parsed answer; a returned
   * reason makes the answer `invalid_response` like a schema miss. Adapters never read it.
   */
  verify?: (data: unknown) => string | null;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  responseSchema?: LlmResponseSchema;
  maxOutputTokens: number;
  temperature?: number;
  /**
   * End of the stable prefix: the index of its last message, or -1 when only the system
   * prompt (and tools) are stable. Adapters with explicit prompt caching put their cache
   * point there; the rest ignore it. Absent = nothing is cached.
   */
  cacheBoundary?: number;
  timeoutMs: number;
}
