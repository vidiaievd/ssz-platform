import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';

import { FinalizeUploadCommand, type FinalizeUploadResult } from '../finalize-upload/finalize-upload.command.js';
import {
  StoreSynthesizedAudioCommand,
  type StoreSynthesizedAudioResult,
} from './store-synthesized-audio.command.js';
import { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(StoreSynthesizedAudioCommand)
export class StoreSynthesizedAudioHandler
  implements ICommandHandler<StoreSynthesizedAudioCommand, StoreSynthesizedAudioResult>
{
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: StoreSynthesizedAudioCommand): Promise<StoreSynthesizedAudioResult> {
    const asset = await this.assetRepo.findByIdAndOwner(command.assetId, command.ownerId);
    if (!asset) return Result.fail('ASSET_NOT_FOUND');
    if (asset.mimeType.value !== command.mimeType) {
      return Result.fail(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
    }

    const attached = asset.attachSynthesis(command.synthesis, BigInt(command.audio.length));
    if (attached.isFail) return Result.fail(attached.error);

    await this.storage.uploadObject(
      asset.storageKey.value,
      command.audio,
      command.mimeType,
      isPublicEntityType(asset.entityType),
    );
    await this.assetRepo.save(asset);

    const finalized: FinalizeUploadResult = await this.commandBus.execute(
      new FinalizeUploadCommand(asset.id, asset.ownerId),
    );
    return finalized.isFail ? Result.fail(finalized.error) : Result.ok();
  }
}
