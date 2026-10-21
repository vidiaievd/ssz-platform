import type { LlmRequest } from './llm-request.js';
import type { LlmChunk, LlmResult } from './llm-result.js';
import type { LlmModelRef, ProviderKind } from './model-features.js';

/**
 * One adapter per provider kind. Both methods raise `LlmError` and nothing else — an SDK
 * exception escaping an adapter is a bug in that adapter.
 */
export interface LlmProvider {
  readonly kind: ProviderKind;
  complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult>;
  stream(request: LlmRequest, model: LlmModelRef): AsyncIterable<LlmChunk>;
}

/** Multi-provider token: every registered adapter, looked up by `kind`. */
export const LLM_PROVIDERS = Symbol('LLM_PROVIDERS');
