import { Inject, Injectable, Logger } from '@nestjs/common';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../domain/repositories/media-asset.repository.interface.js';
import type { MediaAssetEntity } from '../../domain/entities/media-asset.entity.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../shared/application/ports/storage.port.js';
import { EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { MEDIA_EVENT_TYPES } from '@ssz/contracts';
import type { MediaDeletedPayload } from '@ssz/contracts';

/**
 * Takes an asset out of service: soft-delete in the database, then its objects out of storage,
 * then `media.deleted`. One place for what a person deleting their own file and the orphan
 * sweep (plan 71) both do — who may ask is decided by the caller, not here.
 */
@Injectable()
export class AssetPurger {
  private readonly logger = new Logger(AssetPurger.name);

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {}

  async purge(asset: MediaAssetEntity): Promise<Result<void, 'ASSET_ALREADY_DELETED'>> {
    if (asset.isDeleted) return Result.fail('ASSET_ALREADY_DELETED');

    const softDeleteResult = asset.softDelete();
    if (softDeleteResult.isFail) return Result.fail(softDeleteResult.error as 'ASSET_ALREADY_DELETED');

    await this.assetRepo.save(asset);

    // Delete storage objects non-fatally — asset is already soft-deleted in DB.
    const isPublic = isPublicEntityType(asset.entityType);
    await this.deleteStorageObjects(asset.id, asset.storageKey.value, isPublic);

    const payload: MediaDeletedPayload = {
      assetId: asset.id,
      ownerId: asset.ownerId,
      storageKey: asset.storageKey.value,
    };
    await this.events.publish(MEDIA_EVENT_TYPES.DELETED, payload);

    return Result.ok();
  }

  private async deleteStorageObjects(assetId: string, originalKey: string, isPublic: boolean): Promise<void> {
    const variants = await this.prisma.assetVariant.findMany({
      where: { assetId },
      select: { storageKey: true },
    });

    const keysToDelete = [originalKey, ...variants.map((v) => v.storageKey)];

    await Promise.all(
      keysToDelete.map((key) =>
        this.storage.deleteObject(key, isPublic).catch((err) => {
          this.logger.warn(`Failed to delete storage object "${key}": ${err instanceof Error ? err.message : String(err)}`);
        }),
      ),
    );
  }
}
