import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import type { ProsodyOwner } from '../prosody-owner.js';

export const PROSODY_LAYER_REPOSITORY = Symbol('PROSODY_LAYER_REPOSITORY');

/** An authored layer and the text it was anchored to when saved. */
export interface StoredProsody {
  sourceText: string;
  layer: ProsodyLayer;
  updatedAt: Date;
}

export interface IProsodyLayerRepository {
  find(owner: ProsodyOwner): Promise<StoredProsody | null>;
  /** Every prompt's layer of one exercise, keyed by prompt id. */
  findForExercise(exerciseId: string): Promise<Map<string, StoredProsody>>;
  save(
    owner: ProsodyOwner,
    value: { sourceText: string; layer: ProsodyLayer },
    userId: string,
  ): Promise<StoredProsody>;
  /** Idempotent. */
  remove(owner: ProsodyOwner): Promise<void>;
}
