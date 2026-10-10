// What a sitting is allowed to move (plan 72 §3.10, Q1-A; DECISIONS §4).
//
// The answers rate the **contrast**, not the words. A word heard in a minimal pair is not a
// word recalled: choosing «skjære» out of two buttons is a coin-flippable choice, and letting
// it pull the word's review date would teach the scheduler something nobody proved. So the
// words are rated only under `contrast+word`, which the author has to choose on purpose.
//
// The contrast is an atom of its own kind, named by the pack's language and the family —
// `nb:kjsj` — because families live in a pack per language and `kjsj` of another pack is
// another sound. Until plan 63 phase 7 there is no card for it in learning: the atom travels
// as a target of the whole exercise, the analytics service records the evidence, and the set
// comes back to review as one exercise card.

import { contrastsInSet } from './derive.js';
import type { MinimalPairsContent } from './model.js';
import { packFor } from './packs/index.js';

/** The atom type the answers rate. A string, as the event's `atomType` is on purpose. */
export const CONTRAST_ATOM_TYPE = 'phonological_contrast';

/** The vocabulary atom type, as the events spell it. */
const VOCABULARY_ATOM_TYPE = 'vocabulary_item';

/** `nb:kjsj` — the pack's language, not the course's spelling of it (`nb-NO` is `nb`). */
export function contrastAtomId(language: string, contrastId: string): string {
  const lang = packFor(language)?.language ?? language.toLowerCase();
  return `${lang}:${contrastId}`;
}

/**
 * The contrast atoms a sitting rates: every family the set trains, or none under `none`.
 * A family the pack does not know is not an atom — there is nothing to schedule it by.
 */
export function contrastAtoms(ex: MinimalPairsContent): string[] {
  if (ex.scoring.memory === 'none') return [];
  return contrastsInSet(ex)
    .filter((id) => id !== '' && packFor(ex.language)?.contrasts.some((c) => c.id === id) === true)
    .map((id) => contrastAtomId(ex.language, id));
}

/** Only `contrast+word` lets the score of the set reach the words. */
export function ratesWords(ex: MinimalPairsContent): boolean {
  return ex.scoring.memory === 'contrast+word';
}

/**
 * The atoms an attempt carries, with what the author's memory setting forbids taken out and
 * the contrast atoms put in. Works on any `{ atomType, atomId }` list, so the engine can hand it
 * the relation graph and the exercise-level addresses alike.
 */
export function atomsForMemory<T extends { atomType: string; atomId: string }>(
  ex: MinimalPairsContent,
  atoms: readonly T[],
): T[] {
  return ratesWords(ex) ? [...atoms] : atoms.filter((a) => a.atomType !== VOCABULARY_ATOM_TYPE);
}
