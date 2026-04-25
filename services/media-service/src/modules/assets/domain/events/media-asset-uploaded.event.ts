import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface MediaAssetUploadedPayload {
  assetId: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
  entityType: string | null;
  entityId: string | null;
}

export class MediaAssetUploadedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'media.uploaded';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: MediaAssetUploadedPayload,
  ) {}
}
