import type { NoStoredReference, StoredReference } from '../../domain/stored-reference.js';

export const REFERENCE_CLIP_SOURCE = Symbol('IReferenceClipSource');

/**
 * A reference clip to compare a learner's toneme with (plan 88, step 8.2):
 *  - `ready` — media's `speech` variant of the clip and its stored self-check;
 *  - `pending` — media has not finished with the clip yet;
 *  - `missing` — no such asset, or no speech variant will come;
 *  - `not_a_reference` / `no_toneme` — the asset is there, but there is no toneme to compare with.
 */
export type ReferenceClipAudio =
  | { kind: 'ready'; wav: Uint8Array; reference: StoredReference }
  | { kind: 'pending' }
  | { kind: 'missing' }
  | { kind: NoStoredReference };

export interface IReferenceClipSource {
  /** Throws when media-service or the storage cannot answer now. */
  fetch(assetId: string): Promise<ReferenceClipAudio>;
}
