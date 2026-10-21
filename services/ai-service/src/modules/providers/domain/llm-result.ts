/**
 * Token counts, normalized so each is priced once: `input` is the uncached input only —
 * an adapter whose provider folds cache reads into the input count subtracts them.
 */
export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type LlmStopReason = 'end' | 'length' | 'tool' | 'refusal' | 'filtered';

export interface LlmToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * What the model produced. `structured` is only ever set once the answer has been parsed
 * as JSON — whether it matches the schema is `SchemaGuard`'s call, not the adapter's.
 */
export type LlmOutput =
  | { kind: 'text'; text: string }
  | { kind: 'structured'; data: unknown }
  | { kind: 'tool_calls'; calls: LlmToolCall[]; text?: string };

export interface LlmResult {
  output: LlmOutput;
  usage: LlmUsage;
  stop: LlmStopReason;
  providerRequestId: string | null;
  latencyMs: number;
}

export type LlmChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: LlmToolCall }
  /** Always last: the same result `complete` would have returned. */
  | { type: 'done'; result: LlmResult };
