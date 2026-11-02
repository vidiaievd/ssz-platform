import type { PitchCurve, PitchSpan } from '../application/ports/pitch-tracker.js';
import type { AlignedSound } from './align-word.js';

/**
 * Where the onset of the stressed vowel is read, from its start. The first 20 ms are left out:
 * a voiceless consonant before the vowel lifts its first frames (§0.5c), and that lift is not
 * the toneme.
 */
export const ONSET_WINDOW_MS = { from: 20, to: 60 } as const;

/** How far past the end of the post-tonic vowel its level is still read — a voiced coda carries it. */
export const POST_TAIL_MS = 30;

/**
 * The score bounds a reference clip is heard by (§0.5c, step 6b.2, 114 clips of Azure's three
 * voices): above `tone2Above` it is toneme 2, below `tone1Below` toneme 1, between them neither —
 * a clip there proves nothing and is not kept.
 */
export const REFERENCE_TONEME_BOUNDS = { tone1Below: 1.5, tone2Above: 2.5 } as const;

export interface TonemeBounds {
  tone1Below: number;
  tone2Above: number;
}

/**
 * What to track for the toneme of a word: from its stressed vowel to the end of the next one,
 * and where in that span the post-tonic vowel lies.
 */
export interface TonemeWindow {
  span: PitchSpan;
  /** The post-tonic vowel, in ms from the span's start, its tail included. */
  post: { fromMs: number; toMs: number };
}

/** The toneme of a word as its F0 shows it (plan 88, step 6b): what the curve says, not a verdict. */
export interface TonemeMeasure {
  /** Semitones of the stressed vowel's onset from the recording's median F0. */
  onset: number;
  /** Semitones of the post-tonic vowel from the same median. */
  post: number;
  /** `onset − post`: high for toneme 2 (high, then down), low for toneme 1 (low, then up). */
  score: number;
  /** Null when the score falls between the bounds. */
  tone: 1 | 2 | null;
}

/**
 * The window of an aligned word's toneme: its primary-stressed sound and the next syllabic one.
 * Null when the word has no single primary stress or nothing syllabic follows it — then it
 * carries no toneme to measure.
 */
export function tonemeWindow(
  sounds: readonly Pick<AlignedSound, 'startMs' | 'durationMs' | 'stress'>[],
  primaryIndex: number | null,
): TonemeWindow | null {
  if (primaryIndex === null) return null;
  const vowel = sounds[primaryIndex];
  const next = sounds.slice(primaryIndex + 1).find((s) => s.stress !== null);
  if (!vowel || !next) return null;
  const fromMs = next.startMs - vowel.startMs;
  const toMs = fromMs + next.durationMs + POST_TAIL_MS;
  return { span: { startMs: vowel.startMs, endMs: vowel.startMs + toMs }, post: { fromMs, toMs } };
}

/**
 * The toneme measure from the curve of a `tonemeWindow` (§0.5c): the stressed vowel's onset
 * against the post-tonic vowel's level. Null when either has nothing voiced — the toneme is then
 * not measured, rather than guessed. Pure.
 */
export function measureToneme(
  curve: Pick<PitchCurve, 'points'>,
  stepMs: number,
  window: TonemeWindow,
  bounds: TonemeBounds = REFERENCE_TONEME_BOUNDS,
): TonemeMeasure | null {
  const voiced = (from: number, to: number): number[] =>
    curve.points.flatMap((p, i) => (p !== null && i * stepMs >= from && i * stepMs < to ? [p] : []));

  const onsetPoints = voiced(ONSET_WINDOW_MS.from, ONSET_WINDOW_MS.to);
  const postPoints = voiced(window.post.fromMs, window.post.toMs);
  if (onsetPoints.length === 0 || postPoints.length === 0) return null;

  const onset = median(onsetPoints);
  const post = median(postPoints);
  const score = onset - post;
  const tone = score > bounds.tone2Above ? 2 : score < bounds.tone1Below ? 1 : null;
  return { onset: round(onset), post: round(post), score: round(score), tone };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round = (value: number): number => Math.round(value * 100) / 100;
