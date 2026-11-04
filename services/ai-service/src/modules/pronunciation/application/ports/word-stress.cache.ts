import type { LetterSeg } from '../../domain/align-letters.js';
import type { LexiconStress } from '../../domain/word-stress.js';

export const WORD_STRESS_CACHE = Symbol('IWordStressCache');

/**
 * What the lexicon says about one span: its stress mark (null on a function word, an unknown
 * word, a homograph left open) and its letters over its sounds (null where they cannot be laid).
 */
export interface WordAnalysis {
  stress: LexiconStress | null;
  segs: LetterSeg[] | null;
}

/** One answer of `TextWordStresses`, one entry per span. */
export type CachedWordStresses = WordAnalysis[];

/**
 * The word stresses of a text by a hash of the text and its spans (plan 86, step 5b): the same
 * lesson is read by every student, the lexicon changes with a reimport only. A cache that is
 * away is a miss, never a failure.
 */
export interface IWordStressCache {
  get(key: string): Promise<CachedWordStresses | null>;
  set(key: string, value: CachedWordStresses): Promise<void>;
}
