import type { PosToken } from '../../domain/narrow-variants.js';

export const POS_TAGGER = Symbol('IPosTagger');

/**
 * Part-of-speech tagger of a passage (plan 88, step 4b): spaCy in the whisper sidecar. It only
 * narrows the lexicon's variants — without it the review goes on as before.
 */
export interface IPosTagger {
  /**
   * The passage's tokens in order. Empty when the language has no tagger. Throws when the tagger
   * cannot answer (down, timed out, not in this deployment).
   */
  tag(language: string, text: string): Promise<PosToken[]>;
}
