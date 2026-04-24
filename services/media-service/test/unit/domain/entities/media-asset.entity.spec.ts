import { MediaAssetEntity } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import type { CreateMediaAssetProps } from '../../../../src/modules/assets/domain/entities/media-asset.entity.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';

const DEFAULT_LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,
  maxAudioSizeBytes: 100 * 1024 * 1024,
  maxVideoSizeBytes: 500 * 1024 * 1024,
};

function makeAsset(overrides?: Partial<CreateMediaAssetProps>): MediaAssetEntity {
  const result = MediaAssetEntity.create({
    ownerId: 'owner-1',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    originalFilename: 'photo.jpg',
    sizeLimits: DEFAULT_LIMITS,
    ...overrides,
  });
  expect(result.isOk).toBe(true);
  return result.value;
}

describe('MediaAssetEntity', () => {
  describe('create()', () => {
    it('creates asset in PENDING_UPLOAD status', () => {
      const asset = makeAsset();
      expect(asset.status).toBe('PENDING_UPLOAD');
      expect(asset.isPendingUpload).toBe(true);
      expect(asset.uploadedAt).toBeNull();
    });

    it('generates a storage key from ownerId and filename', () => {
      const asset = makeAsset({ ownerId: 'user-123', originalFilename: 'Test File.jpg' });
      expect(asset.storageKey.value).toMatch(/^user-123\/[a-f0-9-]+\/test-file\.jpg$/);
    });

    it('raises MediaAssetCreatedEvent on creation', () => {
      const asset = makeAsset();
      const events = asset.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('media.asset.created');
    });

    it('fails with invalid MIME type', () => {
      const result = MediaAssetEntity.create({
        ownerId: 'owner-1',
        mimeType: 'application/exe',
        sizeBytes: 1024,
        sizeLimits: DEFAULT_LIMITS,
      });
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
    });

    it('fails when file exceeds size limit', () => {
      const result = MediaAssetEntity.create({
        ownerId: 'owner-1',
        mimeType: 'image/jpeg',
        sizeBytes: DEFAULT_LIMITS.maxImageSizeBytes + 1,
        sizeLimits: DEFAULT_LIMITS,
      });
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.FILE_TOO_LARGE);
    });
  });

  describe('status transitions', () => {
    it('PENDING_UPLOAD → UPLOADED via markUploaded()', () => {
      const asset = makeAsset();
      const result = asset.markUploaded();
      expect(result.isOk).toBe(true);
      expect(asset.status).toBe('UPLOADED');
      expect(asset.uploadedAt).toBeInstanceOf(Date);
    });

    it('UPLOADED → PROCESSING via startProcessing()', () => {
      const asset = makeAsset();
      asset.markUploaded();
      const result = asset.startProcessing();
      expect(result.isOk).toBe(true);
      expect(asset.status).toBe('PROCESSING');
    });

    it('PROCESSING → READY via markReady()', () => {
      const asset = makeAsset();
      asset.markUploaded();
      asset.startProcessing();
      const result = asset.markReady([]);
      expect(result.isOk).toBe(true);
      expect(asset.status).toBe('READY');
      expect(asset.isReady).toBe(true);
    });

    it('UPLOADED → READY via markReadyWithoutProcessing()', () => {
      const asset = makeAsset();
      asset.markUploaded();
      const result = asset.markReadyWithoutProcessing();
      expect(result.isOk).toBe(true);
      expect(asset.status).toBe('READY');
    });

    it('markUploaded() fails when not PENDING_UPLOAD', () => {
      const asset = makeAsset();
      asset.markUploaded();
      const result = asset.markUploaded();
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    });

    it('startProcessing() fails when not UPLOADED', () => {
      const asset = makeAsset();
      const result = asset.startProcessing();
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    });

    it('softDelete() transitions any non-deleted status to DELETED', () => {
      const asset = makeAsset();
      const result = asset.softDelete();
      expect(result.isOk).toBe(true);
      expect(asset.status).toBe('DELETED');
      expect(asset.isDeleted).toBe(true);
      expect(asset.deletedAt).toBeInstanceOf(Date);
    });

    it('softDelete() fails when already DELETED', () => {
      const asset = makeAsset();
      asset.softDelete();
      const result = asset.softDelete();
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.ASSET_ALREADY_DELETED);
    });

    it('softDelete() raises MediaAssetDeletedEvent', () => {
      const asset = makeAsset();
      asset.clearDomainEvents();
      asset.softDelete();
      const events = asset.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('media.deleted');
    });

    it('markReady() raises MediaProcessingCompletedEvent', () => {
      const asset = makeAsset();
      asset.markUploaded();
      asset.startProcessing();
      asset.clearDomainEvents();
      asset.markReady([{ variantType: 'thumb_256', storageKey: 'k', mimeType: 'image/webp', sizeBytes: 100n }]);
      const events = asset.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('media.processed');
    });
  });

  describe('belongsTo()', () => {
    it('returns true for correct owner', () => {
      const asset = makeAsset({ ownerId: 'user-abc' });
      expect(asset.belongsTo('user-abc')).toBe(true);
    });

    it('returns false for wrong owner', () => {
      const asset = makeAsset({ ownerId: 'user-abc' });
      expect(asset.belongsTo('user-xyz')).toBe(false);
    });
  });
});
