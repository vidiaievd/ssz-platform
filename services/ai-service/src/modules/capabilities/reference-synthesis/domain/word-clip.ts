/**
 * A word spoken alone by a named voice (plan 86, step 4z.2) — the clip of a `minimal_pairs` word,
 * not a reference: no carrier sentence and no toneme check. Which voice may speak which contrast is
 * the kernel pack's `checkedVoices`, measured and heard elsewhere (plan 86 §4z); here the clip is
 * only heard back, so a voice that said another word is not kept.
 */
export interface WordClip {
  /** PCM 16-bit, 16 kHz, mono — what the synthesizer answered. */
  audio: Uint8Array;
  audioMs: number;
  voice: string;
  /** Azure's 0–100 score of the word, heard back. */
  accuracy: number;
}

/**
 * - `not_a_word` — empty, or more than one word;
 * - `not_available` — synthesis or its check is switched off, or the voice is not one the bound
 *   model has for the language.
 */
export type WordClipRefusal = 'not_a_word' | 'not_available';

export type WordClipOutcome =
  | { status: 'ok'; clip: WordClip; aiCallIds: string[] }
  /** Heard back as another word, or below `MIN_WORD_ACCURACY`; `accuracy` null when not heard at all. */
  | { status: 'rejected'; voice: string; accuracy: number | null; aiCallIds: string[] }
  | { status: 'refused'; reason: WordClipRefusal }
  /** A model did not answer; nothing is known about the clip. */
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };
