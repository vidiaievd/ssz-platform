import { GetAssetHandler } from '../../../../src/modules/assets/application/queries/get-asset/get-asset.handler.js';
import { GetAssetQuery } from '../../../../src/modules/assets/application/queries/get-asset/get-asset.query.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import type { IMediaAssetRepository } from '../../../../src/modules/assets/domain/repositories/media-asset.repository.interface.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function makeAsset(overrides?: { entityType?: string | null }) {
  const result = MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    originalFilename: 'photo.jpg',
    entityType: overrides?.entityType ?? undefined,
    sizeLimits: SIZE_LIMITS,
  });
  return result.value;
}

function makeHandler(asset: MediaAssetEntity | null = makeAsset()) {
  const repo: jest.Mocked<IMediaAssetRepository> = {
    findById: jest.fn(),
    findByIdAndOwner: jest.fn().mockResolvedValue(asset),
    findMany: jest.fn(),
    countMany: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const storage: jest.Mocked<IStorageService> = {
    generatePresignedUploadUrl: jest.fn(),
    generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://minio/private/presigned'),
    getPublicUrl: jest.fn().mockReturnValue('https://minio/public/key'),
    objectExists: jest.fn(),
    getObjectMetadata: jest.fn(),
    deleteObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
  };

  const prisma = {
    assetVariant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const handler = new GetAssetHandler(repo as any, storage as any, prisma as any);
  return { handler, repo, storage, prisma };
}

describe('GetAssetHandler', () => {
  it('returns asset view with presigned URL for private asset', async () => {
    const asset = makeAsset();
    const { handler } = makeHandler(asset);

    const result = await handler.execute(new GetAssetQuery(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(asset.id);
    expect(result.value.url).toBe('https://minio/private/presigned');
    expect(result.value.variants).toEqual([]);
  });

  it('returns direct public URL for profile_avatar entity type', async () => {
    const asset = makeAsset({ entityType: 'profile_avatar' });
    const { handler, storage } = makeHandler(asset);

    const result = await handler.execute(new GetAssetQuery(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
    expect(result.value.url).toBe('https://minio/public/key');
    expect(storage.generatePresignedDownloadUrl).not.toHaveBeenCalled();
    expect(storage.getPublicUrl).toHaveBeenCalled();
  });

  it('includes variants with URLs in response', async () => {
    const asset = makeAsset();
    const { handler, prisma } = makeHandler(asset);
    prisma.assetVariant.findMany.mockResolvedValue([
      { variantType: 'thumb_256', storageKey: 'user/uuid/variants/thumb_256.webp', mimeType: 'image/webp', sizeBytes: 5000n },
    ]);

    const result = await handler.execute(new GetAssetQuery(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
    expect(result.value.variants).toHaveLength(1);
    expect(result.value.variants[0].variantType).toBe('thumb_256');
    expect(result.value.variants[0].url).toBe('https://minio/private/presigned');
  });

  it('returns ASSET_NOT_FOUND when repo returns null', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new GetAssetQuery('missing', 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('ASSET_NOT_FOUND');
  });

  it('returns ASSET_NOT_FOUND for deleted assets', async () => {
    const asset = makeAsset();
    asset.softDelete();
    const { handler } = makeHandler(asset);

    const result = await handler.execute(new GetAssetQuery(asset.id, 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('ASSET_NOT_FOUND');
  });
});
