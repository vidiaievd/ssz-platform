import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListUserAssetsQuery, type ListUserAssetsResult } from './list-user-assets.query.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

const PRESIGNED_TTL_SECONDS = 3600;

@QueryHandler(ListUserAssetsQuery)
export class ListUserAssetsHandler implements IQueryHandler<ListUserAssetsQuery, ListUserAssetsResult> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  async execute(query: ListUserAssetsQuery): Promise<ListUserAssetsResult> {
    const { ownerId, options } = query;

    const [assets, total] = await Promise.all([
      this.assetRepo.findMany({ ownerId, ...options }),
      this.assetRepo.countMany({ ownerId, ...options }),
    ]);

    const items = await Promise.all(
      assets.map(async (asset) => {
        const isPublic = isPublicEntityType(asset.entityType);
        const url = isPublic
          ? this.storage.getPublicUrl(asset.storageKey.value)
          : await this.storage.generatePresignedDownloadUrl(asset.storageKey.value, PRESIGNED_TTL_SECONDS);

        return {
          id: asset.id,
          ownerId: asset.ownerId,
          mimeType: asset.mimeType.value,
          sizeBytes: asset.sizeBytes.asNumber,
          storageKey: asset.storageKey.value,
          originalFilename: asset.originalFilename,
          status: asset.status,
          entityType: asset.entityType,
          entityId: asset.entityId,
          url,
          uploadedAt: asset.uploadedAt?.toISOString() ?? null,
          createdAt: asset.createdAt.toISOString(),
          variants: [],
        };
      }),
    );

    return Result.ok({ items, total, limit: options.limit, offset: options.offset });
  }
}
