export const AUDIO_INSPECTOR = Symbol('AUDIO_INSPECTOR');

export interface Waveform {
  /** Normalised 0..1 maxima, one per bin — what the review queue draws. */
  peaks: number[];
  /** Length of the decoded stream, in milliseconds. */
  durationMs: number;
}

export interface IAudioInspector {
  /**
   * Length of the first audio stream in milliseconds, or null when the bytes are not
   * readable audio. Works for containers that carry no duration header (MediaRecorder's
   * WebM never does).
   */
  durationMs(data: Buffer, extension: string): Promise<number | null>;

  /** Decodes the audio and folds it into `bins` normalised maxima. */
  waveform(data: Buffer, extension: string, bins: number): Promise<Waveform>;
}
