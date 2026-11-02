import type { PitchSpan } from '../application/ports/pitch-tracker.js';
import type { AlignedSound } from './align-word.js';
import { POST_TAIL_MS, REFERENCE_TONEME_BOUNDS, type TonemeBounds, type TonemeMeasure } from './toneme-feature.js';

/**
 * The bounds a learner's toneme is heard by (plan 88, step 8, Q16): wider than a reference's
 * (§0.5c, 1.5 / 2.5), because they were set on synthesized speech, not on people. Only a score
 * past them may say «that sounded like the other toneme». To be set again from the owner's
 * recordings (step 9).
 */
export const LEARNER_TONEME_BOUNDS: TonemeBounds = { tone1Below: 0.5, tone2Above: 3.5 };

/**
 * How far a learner's score must stand from the reference's, in semitones, before a toneme is
 * called the other one (Q16): past the bounds alone a learner who exaggerates the right toneme
 * would never be told off, but one whose voice sits apart from the synthesizer's could be.
 */
export const MIN_GAP_FROM_REFERENCE = 3;

/** Where a score leans when it is not past the bounds: the middle of the reference's dead zone. */
const LEANING_AT = (REFERENCE_TONEME_BOUNDS.tone1Below + REFERENCE_TONEME_BOUNDS.tone2Above) / 2;

/**
 * A learner's toneme against the reference of the same word (Q4):
 * - `like_reference` — the score leans to the word's toneme; nothing to say;
 * - `other_tone` — past the learner's bounds on the other side, and far from the reference:
 *   «that sounded like toneme `heardAs` — listen to the reference», never «wrong»;
 * - `unsure` — leans to the other side, but not that far; nothing to say either;
 * - `not_measured` — no voiced onset or post-tonic vowel in the learner's take.
 */
export type TonemeVerdict =
  { kind: 'like_reference' } | { kind: 'other_tone'; heardAs: 1 | 2 } | { kind: 'unsure' } | { kind: 'not_measured' };

export interface TonemeComparison {
  /** The word's toneme by the lexicon — the one the reference was kept for. */
  tone: 1 | 2;
  /** The learner's measure, its `tone` by `LEARNER_TONEME_BOUNDS`; null when not measured. */
  learner: TonemeMeasure | null;
  /** The reference's score, as its self-check measured it (step 6b.2). */
  referenceScore: number;
  /** `learner.score − referenceScore`; null when the learner was not measured. */
  gap: number | null;
  verdict: TonemeVerdict;
}

/**
 * The learner's toneme measure against the reference's score (plan 88, step 8). The measure must
 * be taken with `LEARNER_TONEME_BOUNDS` — its `tone` is what is trusted. Pure.
 */
export function compareToneme(input: {
  tone: 1 | 2;
  learner: TonemeMeasure | null;
  referenceScore: number;
}): TonemeComparison {
  const { tone, learner, referenceScore } = input;
  if (!learner) return { tone, learner, referenceScore, gap: null, verdict: { kind: 'not_measured' } };

  const gap = round(learner.score - referenceScore);
  const leansTo: 1 | 2 = learner.score > LEANING_AT ? 2 : 1;
  const verdict: TonemeVerdict =
    leansTo === tone
      ? { kind: 'like_reference' }
      : learner.tone !== null && learner.tone !== tone && Math.abs(gap) >= MIN_GAP_FROM_REFERENCE
        ? { kind: 'other_tone', heardAs: learner.tone }
        : { kind: 'unsure' };
  return { tone, learner, referenceScore, gap, verdict };
}

/**
 * The stretch of a word shown as its melody beside the reference's: from the stressed vowel to
 * the word's end, its tail included — the same stretch in both takes, so the two curves start
 * together at the vowel the toneme lives on. Null without a single primary stress.
 */
export function melodySpan(
  sounds: readonly Pick<AlignedSound, 'startMs' | 'durationMs'>[],
  primaryIndex: number | null,
): PitchSpan | null {
  const vowel = primaryIndex === null ? undefined : sounds[primaryIndex];
  const last = sounds[sounds.length - 1];
  if (!vowel || !last) return null;
  return { startMs: vowel.startMs, endMs: last.startMs + last.durationMs + POST_TAIL_MS };
}

const round = (value: number): number => Math.round(value * 100) / 100;
