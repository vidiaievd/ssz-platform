/** One word the recognizer heard, in the order heard. */
export interface HeardWord {
  text: string;
  startMs: number;
  endMs: number;
  /** 0–1; null when the provider does not say. */
  confidence: number | null;
}

/**
 * How a word of the reference text was pronounced, by the provider's own alignment. Feedback
 * only (plan 82 §2.3): the verdict comes from the engine's reading check, not from here.
 */
export interface PronouncedWord {
  text: string;
  /** 0–100. */
  accuracy: number;
  error: 'none' | 'mispronunciation' | 'omission' | 'insertion';
}

/** Pronunciation assessment scores, 0–100. `prosody` is null where the locale has none. */
export interface PronunciationScores {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  words: PronouncedWord[];
}

export interface SpeechResult {
  /**
   * The words heard, as one string — the lexical form where the provider offers one (numbers
   * as words, no punctuation), which is what the reading check compares with the passage.
   */
  transcript: string;
  words: HeardWord[];
  /** Null unless asked for and the model has the feature. */
  pronunciation: PronunciationScores | null;
  /** Length of the audio the provider took — what the call is priced by. */
  audioMs: number;
  providerRequestId: string | null;
  latencyMs: number;
}
