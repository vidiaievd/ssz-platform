/**
 * The addressable pieces of an exercise — plan 63, phase 1.
 *
 * An exercise is a page; the thing a learner is actually right or wrong about is smaller
 * than that, and it is the smaller thing an atom is attached to. This module answers one
 * question for every template: **what can be pointed at inside this document, and what is
 * each piece called.**
 *
 * The names are not invented here. They are whatever the template already calls its pieces
 * in the results it publishes — `sentenceId#tokenIndex` for a gap, the pair id for a pair —
 * because a target keyed differently from the evidence could never be joined to it. Adding
 * a template means adding one function below, not agreeing a format.
 */

export interface ExerciseItem {
  /** As the template already spells it in its own per-item results. */
  key: string;
  /** What the author sees in the builder: `G1`, the left half of a pair, a question stem. */
  label: string;
  /**
   * The surface text this piece is *about* — the word that fills the gap, the left half of
   * a pair. Shown, not matched.
   */
  value: string;
  /**
   * Every surface form a suggester should try against a vocabulary list.
   *
   * More than one because a pair is a word and its meaning, and **which half holds the word
   * is not fixed**: the seeded `match_pairs` exercises put names on the left and the words
   * on the right, and a suggester looking only at the left half of those finds nothing at
   * all. Matching both is not a guess — the pair as a whole is about the word, whichever
   * side it was typed on.
   */
  matchValues: string[];
}

/**
 * `null` — the template has no pieces, and a target on it addresses the whole exercise
 * (`writing_task` is the clear case: one prompt, one text, nothing to point inside).
 *
 * An empty array is a different statement: the template does have pieces and this document
 * has none yet. An author with an empty gap-fill gets "nothing to address here", not "this
 * type cannot be addressed".
 */
export type ExerciseItems = ExerciseItem[] | null;
