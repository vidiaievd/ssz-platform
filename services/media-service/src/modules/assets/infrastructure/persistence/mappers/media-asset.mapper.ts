import type { MediaAssetModel } from '../../../../../../generated/prisma/models/MediaAsset.js';
import { MediaAssetEntity } from '../../../domain/entities/media-asset.entity.js';
import { MimeType } from '../../../domain/value-objects/mime-type.vo.js';
import { SizeBytes } from '../../../domain/value-objects/size-bytes.vo.js';
import { StorageKey } from '../../../domain/value-objects/storage-key.vo.js';

export class MediaAssetMapper {
  static toDomain(raw: MediaAssetModel): MediaAssetEntity {
    return MediaAssetEntity.reconstitute(raw.id, {
      ownerId: raw.ownerId,
      entityType: raw.entityType,
      entityId: raw.entityId,
      mimeType: MimeType.reconstitute(raw.mimeType),
      sizeBytes: SizeBytes.reconstitute(raw.sizeBytes),
      storageKey: StorageKey.reconstitute(raw.storageKey),
      originalFilename: raw.originalFilename,
      status: raw.status as MediaAssetEntity['status'],
      uploadedAt: raw.uploadedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
      durationMs: raw.durationMs,
      peaks: readPeaks(raw.peaks),
    });
  }

  static toCreateData(entity: MediaAssetEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      mimeType: entity.mimeType.value,
      sizeBytes: entity.sizeBytes.value,
      storageKey: entity.storageKey.value,
      originalFilename: entity.originalFilename,
      status: entity.status,
      uploadedAt: entity.uploadedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
      durationMs: entity.durationMs,
      peaks: entity.peaks ?? undefined,
    };
  }

  static toUpdateData(entity: MediaAssetEntity) {
    return {
      entityType: entity.entityType,
      entityId: entity.entityId,
      status: entity.status,
      uploadedAt: entity.uploadedAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
      durationMs: entity.durationMs,
      peaks: entity.peaks ?? undefined,
    };
  }
}

// `peaks` is JSON in the database; anything that is not a list of numbers is treated as absent.
function readPeaks(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === 'number') ? (value as number[]) : null;
}
