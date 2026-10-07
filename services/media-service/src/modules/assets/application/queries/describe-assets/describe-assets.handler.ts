import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DescribeAssetsQuery, type AssetDescription } from './describe-assets.query.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';

// Unknown ids are left out of the answer — the caller treats a missing id as "no such
// recording". Deleted and failed assets are described as they are: the status decides.
@QueryHandler(DescribeAssetsQuery)
export class DescribeAssetsHandler implements IQueryHandler<DescribeAssetsQuery, AssetDescription[]> {
  constructor(@Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository) {}

  async execute(query: DescribeAssetsQuery): Promise<AssetDescription[]> {
    const assets = await this.assetRepo.findByIds([...new Set(query.ids)]);
    return assets.map((a) => ({
      id: a.id,
      ownerId: a.ownerId,
      entityType: a.entityType,
      entityId: a.entityId,
      status: a.status,
      mimeType: a.mimeType.value,
      sizeBytes: a.sizeBytes.asNumber,
      durationMs: a.durationMs,
    }));
  }
}
