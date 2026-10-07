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
  save(asset: MediaAssetEntity): Promise<void>;
  delete(id: string): Promise<void>;
}
