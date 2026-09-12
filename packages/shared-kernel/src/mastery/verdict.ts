// Which cell to work on next, and where to keep quiet — plan 55 §3.9 rule 3 and §3.10.
//
// The rule this file exists for: **below the threshold there is no verdict.** "Weak at
// listening" said on the strength of three attempts is worse than saying nothing, because
// it will be acted on — a teacher will assign listening work the learner may not need.
// So a cell under the threshold is returned in its own list with its own status, never
// sorted in among the answers with a quiet caveat attached.
//
// And the cells with no attempts at all are the second half of §3.10: "no data about
// listening" usually means "there is no listening in this course", which is the coverage
// report's finding arriving from the other side. It is an answer, not an absence, and it
// is the one worth acting on first.

import { LOW_THRESHOLD } from '../analytics/model.js';
import type { MasteryCell, MasteryState } from './model.js';

/**
 * Why a cell is weak, as a teacher would say it — plan 58, DECISIONS §O6.
 *
 * `meanStability` is the only number that tells the two apart, and they demand opposite
 * lessons: a learner who forgets needs the same material again sooner, a learner who
 * never knew it needs it taught differently. Both produce the same run of poor ratings,
 * so a screen that printed only the percentage would leave the teacher guessing.
 *
 *   forgets    — gets it right, loses it fast (stability short for this learner)
 *   never-knew — stable, and stably wrong: the wrong rule is what was learnt
 *   watch      — inside the acting range, named only to explain why it is listed
 *
 * `null` is a fourth answer and an honest one: with no stability recorded there is
 * nothing to tell "forgets" from "never knew", and the screen has to say the pair is
 * weak without claiming to know which. The design pack names three labels; inventing a
 * label for a learner whose memory was never observed would be the kind of claim the
 * whole pack exists to avoid.
 */
export type WeaknessReason = 'forgets' | 'never-knew' | 'watch';

export interface CellProfile extends MasteryCell {
  state: MasteryState;
}

export interface CellVerdict extends MasteryCell {
  successRateEwma: number;
  /** What kind of weakness this is, or `null` when memory was never observed. */
  reason: WeaknessReason | null;
  meanStability: number | null;
  medianSecondsPerItem: number | null;
  attempts: number;
  weightedSample: number;
  lastAttemptAt: Date;
}

export interface UncertainCell extends MasteryCell {
  status: 'insufficient_data';
  attempts: number;
  weightedSample: number;
  /** How much more evidence the cell needs before it gets a verdict. */
  shortfall: number;
}

export interface WeakestCellsOptions {
  /**
   * The weighted sample a cell needs before anything is said about it.
   *
   * Weighted, not counted: twenty answers picked out of four options carry the weight of
   * about seven typed ones, and the threshold is about how much is known, not how often
   * the learner clicked. **Not calibrated** — Q2 of the plan closes on live data, which is
   * why this is a parameter and not a constant.
   */
  minWeightedSample: number;
  /** How many cells to return a verdict on. All of them when omitted. */
  limit?: number;
  /**
   * At or above this success rate a weak cell is only `watch`.
   *
   * The same threshold the grids draw `low` at, so that "coloured as struggling" and
   * "named as struggling" cannot disagree on one screen.
   */
  lowThreshold?: number;
}

export interface WeakestCells {
  /** Weakest first. Only cells that cleared the threshold. */
  weakest: CellVerdict[];
  /** Cells that were attempted but not enough to speak about, thinnest evidence first. */
  insufficient: UncertainCell[];
}

/**
 * Order two cells by how much they need attention.
 *
 * The success rate decides it. Stability and time deliberately do not enter the sort: they
 * answer different questions (§3.9), and rolling three metrics into one number is the
 * mistake the three columns exist to avoid — it would let a fast, forgetful success rate
 * outrank a slow, solid one for reasons nobody could restate.
 *
 * Ties break on the heavier sample, so the better-evidenced of two equally poor cells is
 * the one named first.
 */
/**
 * The learner's own middle, against which "short" is measured.
 *
 * Relative, not absolute: stability is measured in days of a schedule that adapts to the
 * person, so five days may be quick for one learner and slow for another. An absolute
 * cut-off would sort learners by how often they practise rather than by what they forget.
 */
function medianStability(profile: readonly CellProfile[]): number | null {
  const values = profile
    .map((cell) => cell.state.meanStability)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle] as number;
  return (((values[middle - 1] as number) + (values[middle] as number)) / 2);
}

function reasonFor(
  state: MasteryState,
  learnerMedianStability: number | null,
  lowThreshold: number,
): WeaknessReason | null {
  // Inside the acting range: the cell is listed because something has to be first, not
  // because anything is wrong with it.
  if (state.successRateEwma >= lowThreshold) return 'watch';
  if (state.meanStability === null || learnerMedianStability === null) return null;
  return state.meanStability < learnerMedianStability ? 'forgets' : 'never-knew';
}

function byWeakness(a: CellVerdict, b: CellVerdict): number {
  if (a.successRateEwma !== b.successRateEwma) return a.successRateEwma - b.successRateEwma;
  return b.weightedSample - a.weightedSample;
}

export function weakestCells(
  profile: readonly CellProfile[],
  options: WeakestCellsOptions,
): WeakestCells {
  const weakest: CellVerdict[] = [];
  const insufficient: UncertainCell[] = [];
  const lowThreshold = options.lowThreshold ?? LOW_THRESHOLD;
  // Taken over the whole profile, including cells that will not get a verdict: the
  // question is what this learner's memory usually looks like, and a thin cell still
  // answers it.
  const learnerMedianStability = medianStability(profile);

  for (const cell of profile) {
    const { state } = cell;
    if (state.weightedSample < options.minWeightedSample) {
      insufficient.push({
        skill: cell.skill,
        focus: cell.focus,
        status: 'insufficient_data',
        attempts: state.attempts,
        weightedSample: state.weightedSample,
        shortfall: options.minWeightedSample - state.weightedSample,
      });
      continue;
    }

    weakest.push({
      skill: cell.skill,
      focus: cell.focus,
      successRateEwma: state.successRateEwma,
      reason: reasonFor(state, learnerMedianStability, lowThreshold),
      meanStability: state.meanStability,
      medianSecondsPerItem: state.medianSecondsPerItem,
      attempts: state.attempts,
      weightedSample: state.weightedSample,
      lastAttemptAt: state.lastAttemptAt,
    });
  }

  weakest.sort(byWeakness);
  // Thinnest first: the cell furthest from a verdict is the one to send work to if the
  // question was "what do I not know about this learner".
  insufficient.sort((a, b) => b.shortfall - a.shortfall);

  return {
    weakest: options.limit === undefined ? weakest : weakest.slice(0, options.limit),
    insufficient,
  };
}
