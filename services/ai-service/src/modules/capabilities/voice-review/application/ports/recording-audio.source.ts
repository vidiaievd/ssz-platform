export const RECORDING_AUDIO_SOURCE = Symbol('IRecordingAudioSource');

/**
 * A recording as a speech model hears it: media's `speech` variant (plan 82, step 5).
 *  - `ready` — the WAV itself;
 *  - `pending` — media has not finished with the upload yet: worth asking again shortly;
 *  - `missing` — no speech variant will come (unknown, deleted, failed, not a recording).
 */
export type RecordingAudio = { kind: 'ready'; wav: Uint8Array } | { kind: 'pending' } | { kind: 'missing' };

export interface IRecordingAudioSource {
  /** Throws when media-service or the storage cannot answer now. */
  fetch(assetId: string): Promise<RecordingAudio>;
}
