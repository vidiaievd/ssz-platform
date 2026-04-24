import { DeleteAssetHandler } from '../../../../src/modules/assets/application/commands/delete-asset/delete-asset.handler.js';
import { DeleteAssetCommand } from '../../../../src/modules/assets/application/commands/delete-asset/delete-asset.command.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import type { IMediaAssetRepository } from '../../../../src/modules/assets/domain/repositories/media-asset.repository.interface.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function makeLiveAsset() {
  const result = MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    originalFilename: 'photo.jpg',
    sizeLimits: SIZE_LIMITS,
  });
  return result.value;
}

function makeHandler(asset: MediaAssetEntity | null = makeLiveAsset()) {
  const repo: jest.Mocked<IMediaAssetRepository> = {
    findById: jest.fn(),
    findByIdAndOwner: jest.fn().mockResolvedValue(asset),
    findMany: jest.fn(),
    countMany: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn(),
  };

  const storage: jest.Mocked<IStorageService> = {
    generatePresignedUploadUrl: jest.fn(),
    generatePresignedDownloadUrl: jest.fn(),
    getPublicUrl: jest.fn(),
    objectExists: jest.fn(),
    getObjectMetadata: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
  };

  const events: jest.Mocked<IEventPublisher> = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    assetVariant: {
      findMany: jest.fn().mockResolvedValue([
        { storageKey: 'user/uuid/variants/thumb_256.webp' },
        { storageKey: 'user/uuid/variants/thumb_512.webp' },
      ]),
    },
  };

  const handler = new DeleteAssetHandler(repo as any, storage as any, events as any, prisma as any);
  return { handler, repo, storage, events, prisma };
}

describe('DeleteAssetHandler', () => {
  it('soft-deletes asset and publishes media.deleted event', async () => {
    const asset = makeLiveAsset();
    const { handler, repo, events } = makeHandler(asset);

    const result = await handler.execute(new DeleteAssetCommand(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
    expect(repo.save).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith('media.deleted', expect.objectContaining({
      assetId: asset.id,
      ownerId: 'owner-1',
    }));
  });

  it('deletes original + all variant objects from storage', async () => {
    const asset = makeLiveAsset();
    const { handler, storage } = makeHandler(asset);

    await handler.execute(new DeleteAssetCommand(asset.id, 'owner-1'));

    // original key + 2 variant keys = 3 delete calls
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
  });

  it('returns ASSET_NOT_FOUND when asset does not exist', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new DeleteAssetCommand('missing-id', 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('ASSET_NOT_FOUND');
  });

  it('returns ASSET_ALREADY_DELETED for already-deleted asset', async () => {
    const asset = makeLiveAsset();
    asset.softDelete();
    const { handler } = makeHandler(asset);

    const result = await handler.execute(new DeleteAssetCommand(asset.id, 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('ASSET_ALREADY_DELETED');
  });

  it('still succeeds when storage.deleteObject throws (non-fatal)', async () => {
    const asset = makeLiveAsset();
    const { handler, storage } = makeHandler(asset);
    storage.deleteObject.mockRejectedValue(new Error('MinIO unavailable'));

    const result = await handler.execute(new DeleteAssetCommand(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
  });
});
