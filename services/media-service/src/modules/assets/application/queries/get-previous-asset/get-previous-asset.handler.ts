import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';

import { Result } from '../../../../../shared/kernel/result.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { GetAssetQuery, type GetAssetResult } from '../get-asset/get-asset.query.js';
import { GetPreviousAssetQuery, type GetPreviousAssetResult } from './get-previous-asset.query.js';

@QueryHandler(GetPreviousAssetQuery)
export class GetPreviousAssetHandler implements IQueryHandler<GetPreviousAssetQuery, GetPreviousAssetResult> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetPreviousAssetQuery): Promise<GetPreviousAssetResult> {
    const previous = await this.assetRepo.findReplacedBy(query.assetId);
    if (!previous) return Result.fail('ASSET_NOT_FOUND');
    // The view and the read rule are GetAsset's; this query only finds which asset to read.
    return this.queryBus.execute<GetAssetQuery, GetAssetResult>(new GetAssetQuery(previous.id, query.requesterId));
  }
}
