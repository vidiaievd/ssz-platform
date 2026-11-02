export const REFERENCE_SYNTHESIZER = Symbol('REFERENCE_SYNTHESIZER');

/** A span of a clip, in ms from its start. */
export interface ClipSpan {
  startMs: number;
  endMs: number;
}

/** One voice the synthesizer tried, and why its clip was or was not kept. */
export interface ReferenceTry {
  voice: string;
  /** `kept`, `not_heard`, `not_aligned`, `not_measured`, `tone_unsure`, `tone_mismatch`. */
  outcome: string;
  accuracy: number | null;
  measure: { onset: number; post: number; score: number; tone: 1 | 2 | null } | null;
}

/** A clip whose toneme agreed with the lexicon. */
export interface ReferenceClipAudio {
  /** WAV, PCM 16-bit, 16 kHz, mono. */
  wav: Buffer;
  audioMs: number;
  voice: string;
  /** The carrier sentence the word was spoken in. */
  sentence: string;
  word: ClipSpan;
  /** Null when the word carries no toneme. */
  stressedVowel: ClipSpan | null;
}

/**
 * - `ok` — a clip whose toneme agrees with the lexicon (`tone` null: none to agree on);
 * - `rejected` — every voice was tried, none agreed;
 * - `refused` — nothing was synthesized: `not_a_word`, `language_not_supported`, `not_in_lexicon`,
 *   `tone_ambiguous`, `not_available`.
 */
export type ReferenceSynthesis =
  | { status: 'ok'; clip: ReferenceClipAudio; tone: 1 | 2 | null; tries: ReferenceTry[] }
  | { status: 'rejected'; tone: 1 | 2 | null; tries: ReferenceTry[] }
  | { status: 'refused'; reason: string };

/**
 * The second synthesizer (plan 88, step 6b.3, Q10): a reference word spoken by a cloud voice and
 * self-checked for its toneme — ai-service's, since the provider key lives only there. Unlike
 * `ISpeechSynthesizer` it answers what the check found, not only the bytes.
 */
export interface IReferenceSynthesizer {
  /** Name recorded in a clip asset's metadata. */
  readonly provider: string;

  /** Throws when the synthesizer cannot answer (down, timed out, a model or its check failed). */
  reference(word: string, lang: string): Promise<ReferenceSynthesis>;
}
