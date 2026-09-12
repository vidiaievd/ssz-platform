// The arithmetic every analytics surface shares — plan 58, DECISIONS §O9 and DATA_MODEL §5.
//
// Two things live here for the same reason: the school's student list and a group's
// roster once printed two different numbers for the same learner (plan 57, phase 8),
// because one kept `0..1` and the other rounded percentages of its own. Rounding in one
// place is the fix; the place is here, so that both the service and the client round
// identically.

/**
 * `0..1` as whole percent, or `null` when nothing was measured.
 *
 * `null` in, `null` out — deliberately not `0`. Every caller has to decide what to draw
 * for "we do not know", and a helper that answered `0` would make that decision for them
 * silently, in the wrong direction.
 */
export function pct(value: number | null): number | null {
  if (value === null) return null;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100);
}

export interface Distribution {
  median: number;
  p25: number;
  p75: number;
  /** How many learners the distribution was built from. */
  n: number;
}

/**
 * Linear-interpolated quantile of a sorted sample. Exported for tests, not for callers.
 */
function quantileOf(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0] as number;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  if (lower === upper) return low;
  return low + (sorted[upper] as number - low) * (position - lower);
}

/**
 * The group's shape for one unit: median with the p25–p75 band around it.
 *
 * A median rather than a mean, and a band rather than a single line, because the
 * question the chart answers is "did it land with the group", and an average hides the
 * two learners it did not land with — which is the reason the heatmap exists beside it.
 *
 * An empty sample answers `null`, not a zero distribution. Nobody measured is not
 * everybody at zero.
 */
export function distributionOf(values: readonly number[]): Distribution | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: quantileOf(sorted, 0.5),
    p25: quantileOf(sorted, 0.25),
    p75: quantileOf(sorted, 0.75),
    n: sorted.length,
  };
}

/**
 * Where one learner stands against the rest, as a share of the group below them.
 *
 * Returned as a number for the teacher's screen only. The learner's own screen gets a
 * band (`below` / `middle` / `above`) instead — a percentile changes what a learner
 * does, and comparison is not the behaviour the screen is for (DECISIONS D4).
 */
export function percentileOf(own: number, peers: readonly number[]): number | null {
  if (peers.length === 0) return null;
  const below = peers.filter((value) => value < own).length;
  return Math.round((below / peers.length) * 100);
}

export type PositionBand = 'below' | 'middle' | 'above';

/**
 * The learner-facing form of the same fact.
 *
 * The cut points are wide on purpose: the sentence it becomes is "you are around the
 * middle of your group", and a band that flipped on a single homework would make that
 * sentence noise.
 */
export function bandOf(percentile: number): PositionBand {
  if (percentile < 25) return 'below';
  if (percentile > 75) return 'above';
  return 'middle';
}
