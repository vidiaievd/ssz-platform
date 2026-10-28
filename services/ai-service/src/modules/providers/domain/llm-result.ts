import type { LlmNativeTurn } from './llm-request.js';

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
  /** `native` — the turn in the provider's form, to replay on the next round (see `LlmNativeTurn`). */
  | { kind: 'tool_calls'; calls: LlmToolCall[]; text?: string; native?: LlmNativeTurn };

export interface LlmResult {
  output: LlmOutput;
  usage: LlmUsage;
  stop: LlmStopReason;
  providerRequestId: string | null;
  latencyMs: number;
}

export type LlmChunk =
  /**
   * A piece of the answer as the model writes it, unchecked: of a structured answer, a slice of
   * its JSON whatever way the provider carries it (Anthropic's wrapper tool included); of a tool
   * round, whatever text the model wrote beside the calls.
   */
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: LlmToolCall }
  /** Always last: the same result `complete` would have returned. */
  | { type: 'done'; result: LlmResult };
