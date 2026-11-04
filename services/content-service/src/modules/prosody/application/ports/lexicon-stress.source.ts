import type { WordSounds, WordStress } from '@ssz/shared-kernel/prosody';

export const LEXICON_STRESS_SOURCE = Symbol('LEXICON_STRESS_SOURCE');

/** What the lexicon says under a text: the stresses of its words and their letters over their sounds. */
export interface LexiconWords {
  /** Anchored to `text` by the kernel's `tokenize`, source `lexicon`, sorted by token. */
  stresses: WordStress[];
  /** Plan 86, step 6d: the same anchors; a word whose letters cannot be laid over its sounds has none. */
  sounds: WordSounds[];
}

/**
 * The pronunciation lexicon's words under a text (plan 86, steps 5b and 6d): ai-service owns the
 * lexicon (NB Uttale) and the tagger that settles homographs. The student's layer is drawn
 * without them rather than not at all, so this never throws.
 */
export interface ILexiconStressSource {
  /** Empty for a language with no lexicon and when ai-service does not answer. */
  wordsOf(language: string, text: string): Promise<LexiconWords>;
}
