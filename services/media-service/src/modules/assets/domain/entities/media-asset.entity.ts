import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { MimeType } from '../value-objects/mime-type.vo.js';
import { SizeBytes, type SizeLimits } from '../value-objects/size-bytes.vo.js';
import { StorageKey } from '../value-objects/storage-key.vo.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';
import { MediaAssetCreatedEvent } from '../events/media-asset-created.event.js';
import { MediaAssetUploadedEvent } from '../events/media-asset-uploaded.event.js';
import { MediaAssetDeletedEvent } from '../events/media-asset-deleted.event.js';
import { MediaProcessingCompletedEvent, type AssetVariantInfo } from '../events/media-processing-completed.event.js';

export type AssetStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'DELETED';

interface MediaAssetProps {
  ownerId: string;
  entityType: string | null;
  entityId: string | null;
  mimeType: MimeType;
  sizeBytes: SizeBytes;
  storageKey: StorageKey;
  originalFilename: string | null;
  status: AssetStatus;
  uploadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateMediaAssetProps {
  ownerId: string;
  mimeType: string;
  sizeBytes: number | bigint;
  originalFilename?: string;
  entityType?: string;
  entityId?: string;
  sizeLimits: SizeLimits;
}

export class MediaAssetEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: MediaAssetProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get ownerId(): string { return this.props.ownerId; }
  get entityType(): string | null { return this.props.entityType; }
  get entityId(): string | null { return this.props.entityId; }
  get mimeType(): MimeType { return this.props.mimeType; }
  get sizeBytes(): SizeBytes { return this.props.sizeBytes; }
  get storageKey(): StorageKey { return this.props.storageKey; }
  get originalFilename(): string | null { return this.props.originalFilename; }
  get status(): AssetStatus { return this.props.status; }
  get uploadedAt(): Date | null { return this.props.uploadedAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get deletedAt(): Date | null { return this.props.deletedAt; }

  get isPendingUpload(): boolean { return this.props.status === 'PENDING_UPLOAD'; }
  get isUploaded(): boolean { return this.props.status === 'UPLOADED'; }
  get isReady(): boolean { return this.props.status === 'READY'; }
  get isDeleted(): boolean { return this.props.status === 'DELETED'; }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateMediaAssetProps,
    id?: string,
  ): Result<MediaAssetEntity, MediaAssetDomainError> {
    const mimeTypeResult = MimeType.create(p.mimeType);
    if (mimeTypeResult.isFail) return Result.fail(mimeTypeResult.error);

    const mimeType = mimeTypeResult.value;

    const sizeBytesResult = SizeBytes.create(p.sizeBytes, mimeType.category, p.sizeLimits);
    if (sizeBytesResult.isFail) return Result.fail(sizeBytesResult.error);

    const storageKey = StorageKey.generate(p.ownerId, p.originalFilename ?? null);
    const now = new Date();
    const assetId = id ?? randomUUID();

    const entity = new MediaAssetEntity(assetId, {
      ownerId: p.ownerId,
      entityType: p.entityType ?? null,
      entityId: p.entityId ?? null,
      mimeType,
      sizeBytes: sizeBytesResult.value,
      storageKey,
      originalFilename: p.originalFilename ?? null,
      status: 'PENDING_UPLOAD',
      uploadedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    entity.addDomainEvent(
      new MediaAssetCreatedEvent(assetId, {
        assetId,
        ownerId: p.ownerId,
        mimeType: mimeType.value,
        sizeBytes: sizeBytesResult.value.value,
        storageKey: storageKey.value,
        entityType: p.entityType ?? null,
        entityId: p.entityId ?? null,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: MediaAssetProps): MediaAssetEntity {
    return new MediaAssetEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  markUploaded(): Result<void, MediaAssetDomainError> {
    if (this.props.status !== 'PENDING_UPLOAD') {
      return Result.fail(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    }

    const now = new Date();
    this.props.status = 'UPLOADED';
    this.props.uploadedAt = now;
    this.props.updatedAt = now;

    this.addDomainEvent(
      new MediaAssetUploadedEvent(this.id, {
        assetId: this.id,
        ownerId: this.props.ownerId,
        mimeType: this.props.mimeType.value,
        sizeBytes: this.props.sizeBytes.value,
        storageKey: this.props.storageKey.value,
        entityType: this.props.entityType,
        entityId: this.props.entityId,
      }),
    );

    return Result.ok();
  }

  startProcessing(): Result<void, MediaAssetDomainError> {
    if (this.props.status !== 'UPLOADED') {
      return Result.fail(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    }
    this.props.status = 'PROCESSING';
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  markReady(variants: AssetVariantInfo[]): Result<void, MediaAssetDomainError> {
    if (this.props.status !== 'PROCESSING') {
      return Result.fail(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    }
    this.props.status = 'READY';
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new MediaProcessingCompletedEvent(this.id, {
        assetId: this.id,
        ownerId: this.props.ownerId,
        variants,
      }),
    );

    return Result.ok();
  }

  markFailed(): Result<void, MediaAssetDomainError> {
    if (this.props.status === 'DELETED') {
      return Result.fail(MediaAssetDomainError.ASSET_ALREADY_DELETED);
    }
    this.props.status = 'FAILED';
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  // Assets that need no processing (SVG, small files) go directly UPLOADED → READY
  markReadyWithoutProcessing(): Result<void, MediaAssetDomainError> {
    if (this.props.status !== 'UPLOADED') {
      return Result.fail(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    }
    this.props.status = 'READY';
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  softDelete(): Result<void, MediaAssetDomainError> {
    if (this.props.status === 'DELETED') {
      return Result.fail(MediaAssetDomainError.ASSET_ALREADY_DELETED);
    }

    const now = new Date();
    this.props.status = 'DELETED';
    this.props.deletedAt = now;
    this.props.updatedAt = now;

    this.addDomainEvent(
      new MediaAssetDeletedEvent(this.id, {
        assetId: this.id,
        ownerId: this.props.ownerId,
        storageKey: this.props.storageKey.value,
      }),
    );

    return Result.ok();
  }

  belongsTo(userId: string): boolean {
    return this.props.ownerId === userId;
  }
}
