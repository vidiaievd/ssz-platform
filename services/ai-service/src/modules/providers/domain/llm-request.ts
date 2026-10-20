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
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  responseSchema?: LlmResponseSchema;
  maxOutputTokens: number;
  temperature?: number;
  /**
   * Index of the last message that belongs to the stable prefix (system + those messages).
   * Adapters with explicit prompt caching put their cache point there; the rest ignore it.
   */
  cacheBoundary?: number;
  timeoutMs: number;
}
