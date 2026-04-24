import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssetVariantInfo {
  variantType: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
}

export interface MediaProcessingCompletedPayload {
  assetId: string;
  ownerId: string;
  variants: AssetVariantInfo[];
}

export class MediaProcessingCompletedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'media.processed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: MediaProcessingCompletedPayload,
  ) {}
}
