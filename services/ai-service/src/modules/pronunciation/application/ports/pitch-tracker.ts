export const PITCH_TRACKER = Symbol('IPitchTracker');

/** A stretch of a recording, in milliseconds from its start — a stressed vowel and what follows it. */
export interface PitchSpan {
  startMs: number;
  endMs: number;
}

/** F0 on one span, one point every `PitchCurves.stepMs` from `startMs`. */
export interface PitchCurve extends PitchSpan {
  /** Semitones from the recording's median F0; `null` where the frame is unvoiced. */
  points: Array<number | null>;
}

export interface PitchCurves {
  durationMs: number;
  /** The recording's median F0 the semitones are counted from; `null` when nothing in it is voiced. */
  referenceHz: number | null;
  stepMs: number;
  /** One per span asked for, in the same order. */
  curves: PitchCurve[];
}

/**
 * Pitch tracker (plan 88, step 6a): Praat in the whisper sidecar. It measures only — which span is a
 * stressed vowel and what the curve says about the toneme is decided by the caller.
 */
export interface IPitchTracker {
  /**
   * The curves of `spans` in `wav` (16 kHz mono PCM, media's `speech` variant). Throws when the
   * tracker cannot answer (down, timed out, not in this deployment) or refuses the audio or a span.
   */
  track(wav: Buffer, spans: readonly PitchSpan[]): Promise<PitchCurves>;
}
