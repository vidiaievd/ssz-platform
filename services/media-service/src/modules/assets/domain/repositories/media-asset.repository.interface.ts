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

export interface IMediaAssetRepository {
  findById(id: string): Promise<MediaAssetEntity | null>;
  findByIdAndOwner(id: string, ownerId: string): Promise<MediaAssetEntity | null>;
  findMany(options: FindAssetsOptions): Promise<MediaAssetEntity[]>;
  countMany(options: FindAssetsOptions): Promise<number>;
  save(asset: MediaAssetEntity): Promise<void>;
  delete(id: string): Promise<void>;
}
