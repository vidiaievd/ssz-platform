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

import type { MasteryCell, MasteryState } from './model.js';

export interface CellProfile extends MasteryCell {
  state: MasteryState;
}

export interface CellVerdict extends MasteryCell {
  successRateEwma: number;
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
