import type { MediaAssetEntity } from '../entities/media-asset.entity.js';

const DAY_MS = 86_400_000;

/** The moment a replaced lesson asset stops being restorable and the sweep may remove it (D5). */
export function restorableUntil(supersededAt: Date, retentionDays: number): Date {
  return new Date(supersededAt.getTime() + retentionDays * DAY_MS);
}

export interface SupersessionView {
  supersededAt: string | null;
  supersededBy: string | null;
  restorableUntil: string | null;
}

/** The replaced-narration fields of an asset view; all null for an asset in use. */
export function supersessionOf(asset: MediaAssetEntity, retentionDays: number): SupersessionView {
  const at = asset.supersededAt;
  return {
    supersededAt: at?.toISOString() ?? null,
    supersededBy: asset.supersededBy,
    restorableUntil: at ? restorableUntil(at, retentionDays).toISOString() : null,
  };
}
