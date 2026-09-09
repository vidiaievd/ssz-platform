// How much one attempt counts toward the profile — plan 55 §3.9 rule 2.
//
// **Read off the evidence ceilings, not invented beside them.** The table in
// `../evidence` already states, per form of answer, how much a success proves and how
// much a failure proves; a second table of weights would be the same judgement written
// twice, and the two copies would part company in the first plan that touched one of them.
//
// The translation is mechanical, and it is the whole of the idea:
//
//   a success is worth its ceiling      — EASY caps mean "this proves everything"
//   a failure is worth its floor's slack — an AGAIN floor means "no excuses here"
//
// So typing a word from memory and getting it right weighs 1, picking it out of five
// weighs 2/3, and picking it out of two weighs 1/3 — while getting it *wrong* runs the
// other way, because a wrong answer with five words on screen is damning and a wrong
// answer typed out may be a doubled consonant.

import type { EvidenceInput, EvidenceStrength, ReviewRatingValue } from '../evidence/index.js';
import { evidenceStrength, ratingRank } from '../evidence/index.js';

/** AGAIN..EASY spans four ranks, so three steps between the ends. */
const RATING_STEPS = 3;

/** How much a success is worth under this ceiling: EASY → 1, GOOD → 2/3, HARD → 1/3. */
export function successWeight(strength: EvidenceStrength): number {
  return ratingRank(strength.successCap) / RATING_STEPS;
}

/** How much a failure is worth under this floor: AGAIN → 1, HARD → 2/3. */
export function failureWeight(strength: EvidenceStrength): number {
  return (RATING_STEPS - ratingRank(strength.failureFloor)) / RATING_STEPS;
}

export interface WeightInput extends EvidenceInput {
  /** Which way to read the table — the ceiling for a success, the floor for a failure. */
  succeeded: boolean;
}

/**
 * The weight of one attempt, 0–1.
 *
 * An attempt whose form nothing could describe weighs 1 in both directions, exactly as it
 * rates unclamped: the fallback is "count it as it is", never "count it as nothing".
 */
export function evidenceWeight(input: WeightInput): number {
  const strength = evidenceStrength(input);
  return input.succeeded ? successWeight(strength) : failureWeight(strength);
}

/** Recalled or lapsed, as FSRS splits it — see `MasteryObservation.succeeded`. */
export function succeededAt(rating: ReviewRatingValue): boolean {
  return rating !== 'AGAIN';
}
