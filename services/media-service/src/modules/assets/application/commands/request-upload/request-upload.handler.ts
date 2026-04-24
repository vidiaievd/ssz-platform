import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestUploadCommand, type RequestUploadResult } from './request-upload.command.js';
import { MediaAssetEntity } from '../../../domain/entities/media-asset.entity.js';
import { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AppConfig } from '../../../../../config/configuration.js';

@CommandHandler(RequestUploadCommand)
export class RequestUploadHandler
  implements ICommandHandler<RequestUploadCommand, Result<RequestUploadResult, MediaAssetDomainError>>
{
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY)
    private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(
    command: RequestUploadCommand,
  ): Promise<Result<RequestUploadResult, MediaAssetDomainError>> {
    const uploadConfig = this.config.get<AppConfig['upload']>('upload')!;

    const createResult = MediaAssetEntity.create({
      ownerId: command.ownerId,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      originalFilename: command.originalFilename ?? undefined,
      entityType: command.entityType ?? undefined,
      entityId: command.entityId ?? undefined,
      sizeLimits: {
        maxImageSizeBytes: uploadConfig.maxImageSizeBytes,
        maxAudioSizeBytes: uploadConfig.maxAudioSizeBytes,
        maxVideoSizeBytes: uploadConfig.maxVideoSizeBytes,
      },
    });

    if (createResult.isFail) {
      return Result.fail(createResult.error);
    }

    const asset = createResult.value;
    const isPublic = isPublicEntityType(command.entityType);

    const { uploadUrl, expiresAt } = await this.storage.generatePresignedUploadUrl(
      asset.storageKey.value,
      command.mimeType,
      isPublic,
      uploadConfig.presignedUploadTtlSeconds,
    );

    await this.assetRepo.save(asset);

    return Result.ok({
      assetId: asset.id,
      uploadUrl,
      expiresAt,
      storageKey: asset.storageKey.value,
    });
  }
}
