import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface MediaAssetCreatedPayload {
  assetId: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
  entityType: string | null;
  entityId: string | null;
}

export class MediaAssetCreatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'media.asset.created';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: MediaAssetCreatedPayload,
  ) {}
}
