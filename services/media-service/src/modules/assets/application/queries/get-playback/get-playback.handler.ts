import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetPlaybackQuery, type AssetPlayback } from './get-playback.query.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../../../config/configuration.js';

// The variant every browser plays; the opus one is the smaller but Safari is not sure of it.
const PLAYBACK_VARIANT = 'mp3';

// Only assets whose bytes are in storage can be played: not before the upload, not
// after a refusal (the object is removed) and not after a delete.
const PLAYABLE = new Set(['UPLOADED', 'PROCESSING', 'READY']);

@QueryHandler(GetPlaybackQuery)
export class GetPlaybackHandler implements IQueryHandler<GetPlaybackQuery, AssetPlayback[]> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(query: GetPlaybackQuery): Promise<AssetPlayback[]> {
    const assets = (await this.assetRepo.findByIds([...new Set(query.ids)])).filter((a) =>
      PLAYABLE.has(a.status),
    );
    if (assets.length === 0) return [];

    const variants = await this.prisma.assetVariant.findMany({
      where: { assetId: { in: assets.map((a) => a.id) }, variantType: PLAYBACK_VARIANT },
    });
    const variantOf = new Map(variants.map((v) => [v.assetId, v]));

    const ttl = this.config.get<AppConfig['upload']>('upload')!.presignedDownloadTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    return Promise.all(
      assets.map(async (a) => {
        const variant = variantOf.get(a.id);
        const key = variant?.storageKey ?? a.storageKey.value;
        const url = isPublicEntityType(a.entityType)
          ? this.storage.getPublicUrl(key)
          : await this.storage.generatePresignedDownloadUrl(key, ttl);
        return {
          id: a.id,
          url,
          mimeType: variant?.mimeType ?? a.mimeType.value,
          expiresAt,
          durationMs: a.durationMs,
          peaks: a.peaks,
        };
      }),
    );
  }
}
