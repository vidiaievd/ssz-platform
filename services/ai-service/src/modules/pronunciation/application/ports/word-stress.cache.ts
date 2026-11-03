import type { LexiconStress } from '../../domain/word-stress.js';

export const WORD_STRESS_CACHE = Symbol('IWordStressCache');

/** One answer of `TextWordStresses`, per span; null where the span gets no mark. */
export type CachedWordStresses = Array<LexiconStress | null>;

/**
 * The word stresses of a text by a hash of the text and its spans (plan 86, step 5b): the same
 * lesson is read by every student, the lexicon changes with a reimport only. A cache that is
 * away is a miss, never a failure.
 */
export interface IWordStressCache {
  get(key: string): Promise<CachedWordStresses | null>;
  set(key: string, value: CachedWordStresses): Promise<void>;
}
