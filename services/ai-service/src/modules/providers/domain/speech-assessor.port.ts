import type { ProviderKind, SpeechModelRef } from './model-features.js';
import type { SpeechRequest } from './speech-request.js';
import type { SpeechResult } from './speech-result.js';

/**
 * One speech adapter per provider kind, beside the language-model adapters (plan 82, step 3):
 * a recording and its reference text in, the words heard out — with pronunciation scores
 * when the model has them.
 *
 * Raises `LlmError` and nothing else, so a speech failure reads exactly like a model's and
 * `retryable` alone decides the fallback. Audio the provider cannot take is `invalid_request`.
 */
export interface SpeechAssessor {
  readonly kind: ProviderKind;
  assess(request: SpeechRequest, model: SpeechModelRef): Promise<SpeechResult>;
}

/** Multi-provider token: every registered speech adapter, looked up by `kind`. */
export const SPEECH_ASSESSORS = Symbol('SPEECH_ASSESSORS');
