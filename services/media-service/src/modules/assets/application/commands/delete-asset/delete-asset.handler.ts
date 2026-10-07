import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteAssetCommand, type DeleteAssetResult } from './delete-asset.command.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { AssetPurger } from '../../services/asset-purger.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(DeleteAssetCommand)
export class DeleteAssetHandler implements ICommandHandler<DeleteAssetCommand, DeleteAssetResult> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    private readonly purger: AssetPurger,
  ) {}

  async execute(command: DeleteAssetCommand): Promise<DeleteAssetResult> {
    const asset = await this.assetRepo.findByIdAndOwner(command.assetId, command.ownerId);
    if (!asset) return Result.fail('ASSET_NOT_FOUND');
    if (asset.isDeleted) return Result.fail('ASSET_ALREADY_DELETED');

    const purged = await this.purger.purge(asset);
    if (purged.isFail) return Result.fail(purged.error);

    return Result.ok();
  }
}
