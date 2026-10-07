import { FinalizeUploadHandler } from '../../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.handler.js';
import { FinalizeUploadCommand } from '../../../../src/modules/assets/application/commands/finalize-upload/finalize-upload.command.js';
import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import type { IMediaAssetRepository } from '../../../../src/modules/assets/domain/repositories/media-asset.repository.interface.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import type { IAudioInspector } from '../../../../src/shared/application/ports/audio-inspector.port.js';

const SIZE_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function makePendingAsset(overrides?: { mimeType?: string; entityType?: string | null; entityId?: string }) {
  const result = MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: overrides?.mimeType ?? 'image/jpeg',
    sizeBytes: 1024,
    originalFilename: 'photo.jpg',
    entityType: overrides?.entityType !== undefined ? (overrides.entityType ?? undefined) : undefined,
    entityId: overrides?.entityId,
    sizeLimits: SIZE_LIMITS,
  });
  return result.value;
}

function makeRecording() {
  return makePendingAsset({
    mimeType: 'audio/webm;codecs=opus',
    entityType: 'submission_recording',
    entityId: 'attempt-1',
  });
}

function makeHandler(asset: MediaAssetEntity | null = makePendingAsset()) {
  const repo: jest.Mocked<IMediaAssetRepository> = {
    findById: jest.fn(),
    findByIdAndOwner: jest.fn().mockResolvedValue(asset),
    findByIds: jest.fn(),
    findMany: jest.fn(),
    countMany: jest.fn(),
    findRecordingsOlderThan: jest.fn(),
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

  const audio: jest.Mocked<IAudioInspector> = {
    durationMs: jest.fn().mockResolvedValue(5_000),
    waveform: jest.fn(),
  };

  storage.getObject.mockResolvedValue(Buffer.from('recording'));
  storage.deleteObject.mockResolvedValue(undefined);

  const handler = new FinalizeUploadHandler(
    repo as any,
    storage as any,
    events as any,
    imageQueue as any,
    audioQueue as any,
    prisma as any,
    audio as any,
  );

  return { handler, repo, storage, events, prisma, imageQueue, audioQueue, audio };
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

  describe('submission_recording (plan 70)', () => {
    it('measures the stored recording and keeps its duration', async () => {
      const asset = makeRecording();
      const { handler, audio, audioQueue, storage } = makeHandler(asset);

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.isOk).toBe(true);
      expect(audio.durationMs).toHaveBeenCalledWith(expect.any(Buffer), 'webm');
      expect(asset.durationMs).toBe(5_000);
      expect(asset.status).toBe('UPLOADED');
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(audioQueue.add).toHaveBeenCalledWith('AUDIO_CONVERT', expect.anything(), expect.anything());
    });

    it('accepts the hard ceiling plus the half-second tolerance', async () => {
      const asset = makeRecording();
      const { handler, audio } = makeHandler(asset);
      audio.durationMs.mockResolvedValue(180_500);

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.isOk).toBe(true);
    });

    it('refuses a stored object over 8 MB without downloading it, removes it, marks FAILED', async () => {
      const asset = makeRecording();
      const { handler, storage, audio, repo, events, audioQueue } = makeHandler(asset);
      storage.getObjectMetadata.mockResolvedValue({
        sizeBytes: BigInt(8 * 1024 * 1024 + 1),
        mimeType: 'audio/webm',
        lastModified: new Date(),
      });

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.isFail).toBe(true);
      expect(result.error).toBe('RECORDING_TOO_LARGE');
      expect(storage.getObject).not.toHaveBeenCalled();
      expect(audio.durationMs).not.toHaveBeenCalled();
      expect(storage.deleteObject).toHaveBeenCalledWith(asset.storageKey.value, false);
      expect(asset.status).toBe('FAILED');
      expect(repo.save).toHaveBeenCalledWith(asset);
      expect(events.publish).not.toHaveBeenCalled();
      expect(audioQueue.add).not.toHaveBeenCalled();
    });

    it('refuses a recording longer than 180.5 s and removes it', async () => {
      const asset = makeRecording();
      const { handler, storage, audio } = makeHandler(asset);
      audio.durationMs.mockResolvedValue(200_000);

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.error).toBe('RECORDING_TOO_LONG');
      expect(storage.deleteObject).toHaveBeenCalled();
      expect(asset.status).toBe('FAILED');
      expect(asset.durationMs).toBeNull();
    });

    it('refuses a file ffprobe cannot read as audio', async () => {
      const asset = makeRecording();
      const { handler, audio } = makeHandler(asset);
      audio.durationMs.mockResolvedValue(null);

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.error).toBe('RECORDING_UNREADABLE');
      expect(asset.status).toBe('FAILED');
    });

    it('still refuses when removing the object fails', async () => {
      const asset = makeRecording();
      const { handler, storage, audio } = makeHandler(asset);
      audio.durationMs.mockResolvedValue(600_000);
      storage.deleteObject.mockRejectedValue(new Error('minio down'));

      const result = await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(result.error).toBe('RECORDING_TOO_LONG');
      expect(asset.status).toBe('FAILED');
    });

    it('does not measure ordinary audio on finalize', async () => {
      const asset = makePendingAsset({ mimeType: 'audio/mpeg', entityType: 'exercise_asset' });
      const { handler, audio, storage } = makeHandler(asset);

      await handler.execute(new FinalizeUploadCommand(asset.id, 'owner-1'));

      expect(audio.durationMs).not.toHaveBeenCalled();
      expect(storage.getObject).not.toHaveBeenCalled();
    });
  });
});
