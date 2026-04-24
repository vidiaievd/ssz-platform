import { FinalizeUploadHandler } from '../../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.handler.js';
import { FinalizeUploadCommand } from '../../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.command.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import type { IMediaAssetRepository } from '../../../../src/modules/assets/domain/repositories/media-asset.repository.interface.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function makePendingAsset(overrides?: { mimeType?: string; entityType?: string | null }) {
  const result = MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: overrides?.mimeType ?? 'image/jpeg',
    sizeBytes: 1024,
    originalFilename: 'photo.jpg',
    entityType: overrides?.entityType !== undefined ? (overrides.entityType ?? undefined) : undefined,
    sizeLimits: SIZE_LIMITS,
  });
  return result.value;
}

function makeHandler(asset: MediaAssetEntity | null = makePendingAsset()) {
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
    getObjectMetadata: jest.fn().mockResolvedValue({
      sizeBytes: 1024n,
      mimeType: 'image/jpeg',
      lastModified: new Date(),
    }),
    deleteObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
  };

  const events: jest.Mocked<IEventPublisher> = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    processingJob: {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    },
  };

  const imageQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const audioQueue = { add: jest.fn().mockResolvedValue(undefined) };

  const handler = new FinalizeUploadHandler(
    repo as any,
    storage as any,
    events as any,
    imageQueue as any,
    audioQueue as any,
    prisma as any,
  );

  return { handler, repo, storage, events, prisma, imageQueue, audioQueue };
}

describe('FinalizeUploadHandler', () => {
  it('marks asset as UPLOADED and publishes media.uploaded event', async () => {
    const asset = makePendingAsset();
    const { handler, repo, events } = makeHandler(asset);

    const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
    expect(repo.save).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith('media.uploaded', expect.objectContaining({
      assetId: asset.id,
      ownerId: 'owner-1',
    }));
  });

  it('enqueues IMAGE_RESIZE job for image assets', async () => {
    const asset = makePendingAsset({ mimeType: 'image/jpeg' });
    const { handler, imageQueue, audioQueue } = makeHandler(asset);

    await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

    expect(imageQueue.add).toHaveBeenCalledWith('IMAGE_RESIZE', expect.objectContaining({ assetId: asset.id }), expect.any(Object));
    expect(audioQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues AUDIO_CONVERT job for audio assets', async () => {
    const asset = makePendingAsset({ mimeType: 'audio/mpeg' });
    const { handler, imageQueue, audioQueue } = makeHandler(asset);

    await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

    expect(audioQueue.add).toHaveBeenCalledWith('AUDIO_CONVERT', expect.objectContaining({ assetId: asset.id }), expect.any(Object));
    expect(imageQueue.add).not.toHaveBeenCalled();
  });

  it('returns ASSET_NOT_FOUND when asset does not exist', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new FinalizeUploadCommand('missing-id', 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('ASSET_NOT_FOUND');
  });

  it('returns FILE_NOT_FOUND_IN_STORAGE when object is absent in MinIO', async () => {
    const asset = makePendingAsset();
    const { handler, storage } = makeHandler(asset);
    storage.getObjectMetadata.mockResolvedValue(null);

    const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe('FILE_NOT_FOUND_IN_STORAGE');
  });

  it('succeeds even if job enqueueing fails (non-fatal)', async () => {
    const asset = makePendingAsset({ mimeType: 'image/jpeg' });
    const { handler, imageQueue } = makeHandler(asset);
    imageQueue.add.mockRejectedValue(new Error('Redis down'));

    const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

    expect(result.isOk).toBe(true);
  });
});
