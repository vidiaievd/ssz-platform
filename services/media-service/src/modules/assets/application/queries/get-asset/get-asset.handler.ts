import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetAssetQuery, type GetAssetResult, type AssetVariantView } from './get-asset.query.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../../shared/kernel/result.js';

const PRESIGNED_TTL_SECONDS = 3600;

@QueryHandler(GetAssetQuery)
export class GetAssetHandler implements IQueryHandler<GetAssetQuery, GetAssetResult> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetAssetQuery): Promise<GetAssetResult> {
    const asset = await this.assetRepo.findByIdAndOwner(query.assetId, query.requesterId);
    if (!asset || asset.isDeleted) return Result.fail('ASSET_NOT_FOUND');

    const isPublic = isPublicEntityType(asset.entityType);
    const url = isPublic
      ? this.storage.getPublicUrl(asset.storageKey.value)
      : await this.storage.generatePresignedDownloadUrl(asset.storageKey.value, PRESIGNED_TTL_SECONDS);

    const rawVariants = await this.prisma.assetVariant.findMany({
      where: { assetId: asset.id },
      orderBy: { variantType: 'asc' },
    });

    const variants: AssetVariantView[] = await Promise.all(
      rawVariants.map(async (v) => {
        const variantUrl = isPublic
          ? this.storage.getPublicUrl(v.storageKey)
          : await this.storage.generatePresignedDownloadUrl(v.storageKey, PRESIGNED_TTL_SECONDS);
        return {
          variantType: v.variantType,
          mimeType: v.mimeType,
          sizeBytes: Number(v.sizeBytes),
          url: variantUrl,
        };
      }),
    );

    return Result.ok({
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
      variants,
    });
  }
}
