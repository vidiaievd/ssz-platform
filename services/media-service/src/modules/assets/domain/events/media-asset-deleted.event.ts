import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface MediaAssetDeletedPayload {
  assetId: string;
  ownerId: string;
  storageKey: string;
}

export class MediaAssetDeletedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'media.deleted';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: MediaAssetDeletedPayload,
  ) {}
}
