import type { PitchCurve, PitchSpan } from '../application/ports/pitch-tracker.js';

/**
 * The voice's range in the carrier sentence around a toneme word (plan 88, steps 9.3 and 9.5):
 * p90 − p10 of the voiced F0 points of the carrier's words (*Nå sier jeg … igjen*), the word
 * itself left out, in semitones. A trait of the voice, not of the toneme — Finn 13–15, Iselin
 * ~10, Pernille 6–8, the owner 3.5–6 on the step 9.3 bench. Measured and kept only: the toneme
 * verdict stays on the raw score (owner's decision 22.11, OQ-2, variant A) until thresholds on a
 * range-normalised scale are drawn from recordings of several speakers.
 */

/** Fewer voiced points than this in the carrier and the range is not measured (bench 9.3). */
export const FRAME_RANGE_MIN_POINTS = 10;

/** The sidecar refuses a span longer than this (`MAX_PITCH_SEGMENT_MS`); longer words are cut. */
const MAX_SPAN_MS = 2000;

/**
 * The spans of the carrier's words as the recognizer timed them, the toneme word left out:
 * every heard word that does not overlap `word`. Words of no length are skipped.
 */
export function frameSpans(
  heard: readonly { startMs: number; endMs: number }[],
  word: PitchSpan,
): PitchSpan[] {
  return heard
    .filter((w) => w.endMs > w.startMs && w.startMs >= 0 && (w.endMs <= word.startMs || w.startMs >= word.endMs))
    .map((w) => ({ startMs: w.startMs, endMs: Math.min(w.endMs, w.startMs + MAX_SPAN_MS) }));
}

/**
 * p90 − p10 of the voiced points of `curves` pooled, rounded to hundredths; null below
 * `FRAME_RANGE_MIN_POINTS`. The percentiles interpolate linearly between ranks, as numpy's
 * default does — the bench 9.3 numbers. Pure.
 */
export function frameRange(curves: readonly Pick<PitchCurve, 'points'>[]): number | null {
  const voiced = curves.flatMap((c) => c.points.filter((p): p is number => p !== null && Number.isFinite(p)));
  if (voiced.length < FRAME_RANGE_MIN_POINTS) return null;
  const sorted = [...voiced].sort((a, b) => a - b);
  return Math.round((percentile(sorted, 90) - percentile(sorted, 10)) * 100) / 100;
}

/** numpy's `percentile(…, method='linear')` over sorted values. */
function percentile(sorted: readonly number[], q: number): number {
  const rank = ((sorted.length - 1) * q) / 100;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low);
}
