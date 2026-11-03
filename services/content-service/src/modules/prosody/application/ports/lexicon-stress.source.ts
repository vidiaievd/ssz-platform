import type { WordStress } from '@ssz/shared-kernel/prosody';

export const LEXICON_STRESS_SOURCE = Symbol('LEXICON_STRESS_SOURCE');

/**
 * The pronunciation lexicon's word stresses under a text (plan 86, step 5b): ai-service owns the
 * lexicon (NB Uttale) and the tagger that settles homographs. The student's layer is drawn
 * without them rather than not at all, so this never throws.
 */
export interface ILexiconStressSource {
  /**
   * Stresses anchored to `text` by the kernel's `tokenize`, source `lexicon`, sorted by token.
   * Empty for a language with no lexicon and when ai-service does not answer.
   */
  stressesOf(language: string, text: string): Promise<WordStress[]>;
}
