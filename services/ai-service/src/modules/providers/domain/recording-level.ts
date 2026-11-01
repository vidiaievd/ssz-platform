import { readWav } from './wav.js';

/**
 * How loud a recording is, in dBFS over 20 ms frames (plan 88, step 4): `floorDb` the quiet
 * frames (10th percentile — pauses, room noise), `speechDb` the loud ones (95th — the voice).
 */
export interface RecordingLevel {
  floorDb: number;
  speechDb: number;
  /** `speechDb` − `floorDb`: how far the voice stands out of the noise. */
  contrastDb: number;
}

/**
 * Below these Azure hears nothing, and nothing is worth paying for. Measured on the dev
 * recordings (20 takes from phones and the browser + the 5 of plan 86, session 1): each one
 * Azure heard nothing in — even at 5–7× gain — stood 14–17 dB out of its noise; each one it
 * heard, 34–80 dB. A constant tone stands 0 dB out. Near-silence is caught by `speechDb`.
 */
export const AUDIBLE_MIN_CONTRAST_DB = 25;
export const AUDIBLE_MIN_SPEECH_DB = -50;

const FRAME_MS = 20;
/** Digital silence has no level; it counts as this. */
const SILENCE_DB = -96;

/** Null when the recording is not 16-bit PCM WAV or is shorter than one frame — then not judged. */
export function recordingLevel(data: Uint8Array): RecordingLevel | null {
  const wav = readWav(data);
  if (!wav || wav.format !== 1 || wav.bitsPerSample !== 16) return null;
  const view = new DataView(wav.samples.buffer, wav.samples.byteOffset, wav.samples.byteLength);
  const count = Math.floor(wav.samples.byteLength / 2);
  // All channels interleaved: a frame's level is over every sample in it.
  const frame = Math.round((wav.sampleRate * wav.channels * FRAME_MS) / 1000);
  if (frame === 0 || count < frame) return null;

  const frames: number[] = [];
  for (let start = 0; start + frame <= count; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) {
      const sample = view.getInt16(i * 2, true);
      sum += sample * sample;
    }
    frames.push(dbfs(Math.sqrt(sum / frame)));
  }
  frames.sort((a, b) => a - b);
  const floorDb = percentile(frames, 0.1);
  const speechDb = percentile(frames, 0.95);
  return { floorDb, speechDb, contrastDb: round1(speechDb - floorDb) };
}

/** Whether a voice can be heard in it at all. A recording that cannot be measured is given the benefit of the doubt. */
export function audible(level: RecordingLevel | null): boolean {
  return level === null || (level.speechDb >= AUDIBLE_MIN_SPEECH_DB && level.contrastDb >= AUDIBLE_MIN_CONTRAST_DB);
}

function dbfs(rms: number): number {
  return rms < 1 ? SILENCE_DB : Math.max(SILENCE_DB, 20 * Math.log10(rms / 32768));
}

function percentile(sorted: number[], p: number): number {
  return round1(sorted[Math.floor(p * (sorted.length - 1))]!);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
