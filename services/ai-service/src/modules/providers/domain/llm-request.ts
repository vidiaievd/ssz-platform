/**
 * A provider-neutral model call. Every adapter translates this into its own SDK's shape;
 * nothing above `providers` ever sees a vendor type.
 */

/** One piece of a message. Images and audio join this union when an agent needs them. */
export type LlmPart = { type: 'text'; text: string };

export interface LlmMessage {
  role: 'user' | 'assistant';
  parts: LlmPart[];
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
