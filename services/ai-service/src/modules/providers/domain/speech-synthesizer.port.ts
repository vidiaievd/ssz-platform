import type { ProviderKind, TtsModelRef } from './model-features.js';
import type { SynthesisRequest } from './synthesis-request.js';
import type { SynthesisResult } from './synthesis-result.js';

/**
 * One synthesis adapter per provider kind (plan 88, step 6b): a text in, a WAV out. Raises
 * `LlmError` and nothing else, like the other adapters, so `retryable` alone decides the
 * fallback. A text or voice the provider cannot take is `invalid_request`.
 */
export interface SpeechSynthesizer {
  readonly kind: ProviderKind;
  synthesize(request: SynthesisRequest, model: TtsModelRef): Promise<SynthesisResult>;
}

/** Multi-provider token: every registered synthesis adapter, looked up by `kind`. */
export const SPEECH_SYNTHESIZERS = Symbol('SPEECH_SYNTHESIZERS');
