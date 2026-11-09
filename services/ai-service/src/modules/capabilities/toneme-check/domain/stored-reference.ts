import type { ClipSpan } from '../../reference-synthesis/domain/reference-clip.js';

/**
 * A reference clip as media keeps it (plan 88, step 8.2): what its self-check found when it was
 * kept (step 6b.2) — enough to compare a learner's toneme with it without hearing it again.
 */
export interface StoredReference {
  word: string;
  sentence: string;
  /** The lexicon's toneme the clip agreed with. */
  tone: 1 | 2;
  /** Where the word and its stressed vowel are in the clip, in ms. */
  wordSpan: ClipSpan;
  stressedVowel: ClipSpan;
  /** The kept voice's toneme score (`onset − post`, semitones). */
  score: number;
  voice: string;
}

/**
 * Why media's description of an asset gives no reference to compare with:
 * - `not_a_reference` — not a reference clip, or its check is not one this service wrote;
 * - `no_toneme` — the word carries no toneme (a final stressed syllable, *hus*): kept unmeasured.
 */
export type NoStoredReference = 'not_a_reference' | 'no_toneme';

/**
 * The reference out of `describe`'s `reference` field. It comes from another service, so every
 * field is checked; the kept voice is the last try, and only its measure is the reference's. Pure.
 */
export function storedReferenceOf(raw: unknown): StoredReference | NoStoredReference {
  if (!isRecord(raw) || typeof raw['word'] !== 'string' || typeof raw['sentence'] !== 'string')
    return 'not_a_reference';
  if (raw['tone'] === null) return 'no_toneme';
  const tone = raw['tone'];
  const wordSpan = spanOf(raw['wordSpan']);
  const stressedVowel = spanOf(raw['stressedVowel']);
  const tries = raw['tries'];
  const kept = Array.isArray(tries) ? tries[tries.length - 1] : undefined;
  if ((tone !== 1 && tone !== 2) || !wordSpan || !stressedVowel || !isRecord(kept)) return 'not_a_reference';
  const measure = kept['measure'];
  if (kept['outcome'] !== 'kept' || typeof kept['voice'] !== 'string' || !isRecord(measure)) return 'not_a_reference';
  const score = measure['score'];
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'not_a_reference';
  return { word: raw['word'], sentence: raw['sentence'], tone, wordSpan, stressedVowel, score, voice: kept['voice'] };
}

function spanOf(raw: unknown): ClipSpan | null {
  if (!isRecord(raw)) return null;
  const { startMs, endMs } = raw;
  return typeof startMs === 'number' && typeof endMs === 'number' && startMs >= 0 && endMs > startMs
    ? { startMs, endMs }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
