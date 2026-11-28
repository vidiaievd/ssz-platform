import type { TonemeVerdict } from '../../../../pronunciation/domain/toneme-comparison.js';

export const TONEME_MEASUREMENT_RECORDER = Symbol('ITonemeMeasurementRecorder');

/**
 * One measured take of a toneme (plan 88, step 9.5): the raw scores the verdict was given on and
 * the voices' ranges in the carrier beside them, kept to draw thresholds on a range-normalised
 * scale later (plan 89 §4.1, OQ-30). No audio and no text but the word.
 */
export interface TonemeMeasurement {
  /** The ledger row of the paid call that heard the take — one measurement per call. */
  aiCallId: string;
  language: string;
  word: string;
  /** The word's toneme by the lexicon. */
  tone: 1 | 2;
  /** Null when the learner's toneme was not measured. */
  learnerScore: number | null;
  learnerFrameRange: number | null;
  referenceScore: number;
  referenceFrameRange: number | null;
  /** The synthetic voice the reference was kept from. */
  referenceVoice: string;
  verdict: TonemeVerdict['kind'];
  /** A pronunciation session's take (plan 86, step 14.1); null for a drill's. */
  sessionId: string | null;
  measuredAt: Date;
}

export interface ITonemeMeasurementRecorder {
  /** Keeps one measurement; a second one for the same call is ignored. Throws when the store fails. */
  record(measurement: TonemeMeasurement): Promise<void>;
}
