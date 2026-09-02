// Folding one attempt into a cell — plan 55 §3.9 rule 1.
//
// An exponentially weighted average rather than a lifetime one, because **weakness has to
// expire**: a learner who sorted their grammar out in July must not still read as weak in
// September on the strength of June. A lifetime mean cannot forget, and a profile that
// cannot forget stops describing the learner and starts describing their history.
//
// The evidence weight enters as a *rate*, not as a count: a thin attempt moves the average
// a little way, a strong one moves it far. That is the same statement as "twenty
// four-option questions are not twenty free answers", made continuous.

import type { EwmaOptions, MasteryObservation, MasteryState } from './model.js';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Blend a new reading into a running average, seeding on the first one.
 *
 * Seeding rather than starting from zero: a first observation is the best estimate there
 * is, and starting at zero would make every learner's first attempt look like a failure
 * that is slowly being lived down.
 */
function blend(previous: number | null, value: number, rate: number): number {
  return previous === null ? value : previous + rate * (value - previous);
}

/**
 * The cell after this attempt.
 *
 * `previous` is `null` for a cell nothing has landed in yet. Pure: the caller reads the
 * row, calls this, and writes the result back — the projection holds no arithmetic of its
 * own, which is what makes any of this testable.
 */
export function foldAttempt(
  previous: MasteryState | null,
  observation: MasteryObservation,
  options: EwmaOptions,
): MasteryState {
  const weight = clamp01(observation.weight);
  // How far this attempt is allowed to move the average. A weightless attempt moves
  // nothing but is still counted in `attempts`: it happened, it just proves nothing.
  const rate = clamp01(options.alpha * weight);
  const outcome = observation.succeeded ? 1 : 0;

  return {
    successRateEwma: blend(previous?.successRateEwma ?? null, outcome, rate),
    // Stability and time are measurements, not inferences, so they blend at the plain
    // rate: how much the *outcome* proves has no bearing on how long the learner took or
    // on what interval the scheduler settled on.
    meanStability:
      observation.stability === null
        ? (previous?.meanStability ?? null)
        : blend(previous?.meanStability ?? null, observation.stability, options.alpha),
    medianSecondsPerItem:
      observation.secondsPerItem === null
        ? (previous?.medianSecondsPerItem ?? null)
        : blend(previous?.medianSecondsPerItem ?? null, observation.secondsPerItem, options.alpha),
    attempts: (previous?.attempts ?? 0) + 1,
    // Grows separately from `attempts`, and this is the pair the confidence threshold
    // reads: twenty attempts worth a third of an attempt each are not twenty attempts.
    weightedSample: (previous?.weightedSample ?? 0) + weight,
    lastAttemptAt: observation.at,
  };
}
