/**
 * One recording to recognize (plan 82, step 3). Provider-neutral, like `LlmRequest`: every
 * speech adapter translates it into its own API's shape.
 */

/**
 * The recording itself. Only WAV for now — PCM 16-bit, 16 kHz, mono, which both NB-Whisper
 * and Azure take as it is (media's `speech` variant, step 5).
 */
export interface SpeechAudio {
  format: 'wav';
  data: Uint8Array;
}

export interface SpeechRequest {
  audio: SpeechAudio;
  /**
   * What the learner was asked to read. Pronunciation assessment scores against it. A plain
   * recognizer must NOT be primed with it: biased toward the passage, it hears the passage, and
   * a misread word comes back as read.
   */
  referenceText: string;
  /** The course language (`nb`); the adapter maps it to its provider's locale (`nb-NO`). */
  language: string;
  /** Ask for pronunciation scores as well. Ignored by a model without the feature. */
  pronunciation: boolean;
  timeoutMs: number;
}
