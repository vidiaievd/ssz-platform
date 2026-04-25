import { RequestUploadHandler } from '../../../../src/modules/assets/application/commands/request-upload/request-upload.handler.js';
import { RequestUploadCommand } from '../../../../src/modules/assets/application/commands/request-upload/request-upload.command.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';
import type { IMediaAssetRepository } from '../../../../src/modules/assets/domain/repositories/media-asset.repository.interface.js';
import type { IStorageService } from '../../../../src/shared/application/ports/storage.port.js';

const UPLOAD_CONFIG = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
  presignedUploadTtlSeconds: 900,
  presignedDownloadTtlSeconds: 3600,
};

function makeHandler() {
  const repo: jest.Mocked<IMediaAssetRepository> = {
    findById: jest.fn(),
    findByIdAndOwner: jest.fn(),
    findMany: jest.fn(),
    countMany: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn(),
  };

  const storage: jest.Mocked<IStorageService> = {
    generatePresignedUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://minio/upload/presigned',
      expiresAt: new Date('2030-01-01'),
    }),
    generatePresignedDownloadUrl: jest.fn(),
    getPublicUrl: jest.fn(),
    objectExists: jest.fn(),
    getObjectMetadata: jest.fn(),
    deleteObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
  };

  const config = {
    get: jest.fn().mockReturnValue(UPLOAD_CONFIG),
  };

  const handler = new RequestUploadHandler(repo as any, storage as any, config as any);
  return { handler, repo, storage };
}

describe('RequestUploadHandler', () => {
  it('creates a PENDING_UPLOAD asset and returns a presigned URL', async () => {
    const { handler, repo, storage } = makeHandler();

    const result = await handler.execute(
      new RequestUploadCommand('user-1', 'image/jpeg', 2048n, 'photo.jpg', null, null),
    );

    expect(result.isOk).toBe(true);
    expect(result.value.uploadUrl).toBe('https://minio/upload/presigned');
    expect(result.value.assetId).toBeTruthy();
    expect(result.value.storageKey).toMatch(/^user-1\//);

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(storage.generatePresignedUploadUrl).toHaveBeenCalledWith(
      result.value.storageKey,
      'image/jpeg',
      false,
      UPLOAD_CONFIG.presignedUploadTtlSeconds,
    );
  });

  it('generates presigned URL targeting public bucket for profile_avatar', async () => {
    const { handler, storage } = makeHandler();

    const result = await handler.execute(
      new RequestUploadCommand('user-1', 'image/png', 1024n, 'avatar.png', 'profile_avatar', 'profile-1'),
    );

    expect(result.isOk).toBe(true);
    expect(storage.generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.any(String),
      'image/png',
      true,
      UPLOAD_CONFIG.presignedUploadTtlSeconds,
    );
  });

  it('fails with UNSUPPORTED_MIME_TYPE for disallowed MIME', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(
      new RequestUploadCommand('user-1', 'application/exe', 1024n, null, null, null),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
  });

  it('fails with FILE_TOO_LARGE when size exceeds image limit', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(
      new RequestUploadCommand('user-1', 'image/jpeg', BigInt(UPLOAD_CONFIG.maxImageSizeBytes + 1), null, null, null),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(MediaAssetDomainError.FILE_TOO_LARGE);
  });
});
