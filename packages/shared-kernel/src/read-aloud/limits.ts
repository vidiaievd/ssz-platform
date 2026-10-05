// The recording envelope — infrastructure, not pedagogy (README «Limits», DECISIONS §7).
//
// One copy for every reader: the builder's estimates, the recorder's hard stop, the media
// service's ingest refusal and the engine's check before routing a submission all read these
// numbers from here. A ceiling written twice is two ceilings within a plan.

import { tokenize } from '../text/words.js';

export const LIMITS = {
  /** No recording is longer, whatever the prompt allows — the upload refuses it. */
  hardMaxSeconds: 180,
  /** 8 MiB — opus at ~24 kbps mono stays far below it. */
  maxBytes: 8 * 1024 * 1024,
  /** What the web recorder asks for first. */
  mime: 'audio/webm;codecs=opus',
  /** Safari, and the phone. */
  fallbackMime: 'audio/mp4',
  /** Bits per second asked of the recorder. */
  bitrate: 24_000,
  /**
   * Seconds forgiven either side of a prompt's range when the server measures a recording —
   * the recorder counts whole seconds, the container is measured in milliseconds. The same
   * tolerance the audio layer gives a timecode (plan 68, `AUD_SEG_BEYOND`).
   */
  toleranceSeconds: 0.5,
} as const;

/** The MIME types a recording may arrive in, without codec parameters. */
export const RECORDING_MIME_TYPES: readonly string[] = ['audio/webm', 'audio/mp4', 'audio/ogg'];

/** ~3 KB a second at 24 kbps mono — the prototype's `raBytes`, used for estimates only. */
export function bytesFor(seconds: number): number {
  return Math.round(seconds * 3 * 1024);
}

/** `m:ss`, the prototype's `raFmt`. Negative and fractional inputs are clamped and rounded. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function wordCount(text: string): number {
  return tokenize(text).length;
}

/** A slow-but-fair A2 reading pace. The estimate only sanity-checks the limits. */
export const READING_WPM = 105;

/** About how long a passage takes aloud, in whole seconds (`raReadSeconds`). */
export function readSeconds(text: string): number {
  return Math.round((wordCount(text) / READING_WPM) * 60);
}

/** The longest a prompt's recording may run — its own maximum, never past the hard ceiling. */
export function recordLimit(maxSeconds: number): number {
  return Math.min(Math.max(1, maxSeconds), LIMITS.hardMaxSeconds);
}

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}
