import type { MediaAssetEntity } from '../entities/media-asset.entity.js';

export const MEDIA_ASSET_REPOSITORY = Symbol('MEDIA_ASSET_REPOSITORY');

export interface FindAssetsOptions {
  ownerId?: string;
  entityType?: string;
  entityId?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/** Where the last batch of recordings ended; the next one starts after it. */
export interface RecordingSweepCursor {
  createdAt: Date;
  id: string;
}

/** Where the last batch of replaced lesson assets ended (plan 74). */
export interface SupersededSweepCursor {
  supersededAt: Date;
  id: string;
}

export interface IMediaAssetRepository {
  findById(id: string): Promise<MediaAssetEntity | null>;
  findByIdAndOwner(id: string, ownerId: string): Promise<MediaAssetEntity | null>;
  /** Unknown ids are left out; order is not guaranteed. */
  findByIds(ids: readonly string[]): Promise<MediaAssetEntity[]>;
  findMany(options: FindAssetsOptions): Promise<MediaAssetEntity[]>;
  countMany(options: FindAssetsOptions): Promise<number>;
  /**
   * Recordings (`submission_recording`) not yet deleted and created before `olderThan`, oldest
   * first, in the stable order (`createdAt`, `id`) the cursor walks — a sweep that deletes as
   * it goes still moves forward, and a dry run sees each file once (plan 71).
   */
  findRecordingsOlderThan(
    olderThan: Date,
    after: RecordingSweepCursor | null,
    limit: number,
  ): Promise<MediaAssetEntity[]>;
  /**
   * Assets of any kind still in `PENDING_UPLOAD` and created before `olderThan` — an upload
   * that was asked for and never finished (plan 76, 5.1). Same order and cursor as recordings.
   */
  findAbandonedUploadsOlderThan(
    olderThan: Date,
    after: RecordingSweepCursor | null,
    limit: number,
  ): Promise<MediaAssetEntity[]>;
  /**
   * Uploaded content assets of the given kinds created before `olderThan`, for the orphan
   * sweep (plan 76, phase 5): not deleted, not pending (5.1 takes those), and not replaced —
   * a replaced narration is the retention sweep's, whose undo window this must not cut short.
   */
  findContentAssetsOlderThan(
    entityTypes: readonly string[],
    olderThan: Date,
    after: RecordingSweepCursor | null,
    limit: number,
  ): Promise<MediaAssetEntity[]>;
  /**
   * Lesson assets replaced before `supersededBefore` and not yet deleted, in the stable order
   * (`supersededAt`, `id`) the cursor walks (plan 74, D5).
   */
  findSupersededBefore(
    supersededBefore: Date,
    after: SupersededSweepCursor | null,
    limit: number,
  ): Promise<MediaAssetEntity[]>;
  /** The not-deleted asset most recently replaced by `assetId` — what "go back" returns to. */
  findReplacedBy(assetId: string): Promise<MediaAssetEntity | null>;
  save(asset: MediaAssetEntity): Promise<void>;
  delete(id: string): Promise<void>;
}
