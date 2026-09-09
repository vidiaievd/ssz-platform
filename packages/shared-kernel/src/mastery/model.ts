// The mastery profile — plan 55 §3.9.
//
// One cell per (skill × focus): "how is this learner doing at grammar, in reading". The
// projection over these cells lives in analytics; everything that decides *what a cell
// becomes* lives here, pure, because it is a judgement that has to be tested and has to
// stay the same in every service that ever reads it.
//
// Three metrics, and they are not interchangeable (§3.9):
//
//   successRateEwma      — does it come out right
//   meanStability        — does it stay in memory ("forgets" ≠ "never knew")
//   medianSecondsPerItem — does it come easily (fluency at the same percentage)

import type { Focus, Skill } from '../skills/model.js';

/**
 * Which cell an attempt belongs to.
 *
 * `unknown` is a bucket, not a hole — the same one the coverage report prints for a focus
 * nothing could derive (§3.10). Today it is where nearly every attempt lands, because no
 * `ContentRelation` rows are seeded; dropping those attempts instead would leave the
 * profile empty and say nothing about why.
 */
export interface MasteryCell {
  skill: Skill | 'unknown';
  focus: Focus | 'unknown';
}

/** What a cell holds. `null` metrics mean nothing observable has arrived yet. */
export interface MasteryState {
  successRateEwma: number;
  meanStability: number | null;
  medianSecondsPerItem: number | null;
  /** How many attempts landed in the cell, however thin each one was. */
  attempts: number;
  /** The same attempts counted by how much they proved — the threshold reads this one. */
  weightedSample: number;
  lastAttemptAt: Date;
}

/** One attempt, reduced to what a cell can absorb. */
export interface MasteryObservation {
  /**
   * Recalled or lapsed, as FSRS itself splits it: anything but `AGAIN` says the item came
   * back. Taken from the rating that actually reached the scheduler, which is safe against
   * double-counting the evidence weight — the clamp only ever moves a rating toward the
   * middle, never across the line between a lapse and a recall.
   */
  succeeded: boolean;
  /** How much this attempt proves, 0–1, from `evidenceWeight`. */
  weight: number;
  /** FSRS stability after the review, in days. */
  stability: number | null;
  /** How long the learner spent, per item of the exercise. */
  secondsPerItem: number | null;
  at: Date;
}

export interface EwmaOptions {
  /**
   * How fast the profile forgets, before the evidence weight is applied.
   *
   * **Not calibrated.** Q2 of the plan closes on live data; until there are attempts to
   * look at, this is a starting point and is passed in from configuration rather than
   * frozen here, so that changing it is a deployment and not a release.
   */
  alpha: number;
}

/** Every cell an attempt is evidence for. */
export function cellsFor(
  skills: readonly Skill[],
  focus: readonly Focus[],
): MasteryCell[] {
  const skillKeys: Array<Skill | 'unknown'> = skills.length > 0 ? [...skills] : ['unknown'];
  const focusKeys: Array<Focus | 'unknown'> = focus.length > 0 ? [...focus] : ['unknown'];

  const cells: MasteryCell[] = [];
  for (const skill of skillKeys) {
    for (const focusKey of focusKeys) cells.push({ skill, focus: focusKey });
  }
  return cells;
}
