import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';

export interface ContentShareRevokedPayload {
  shareId: string;
  entityType: TaggableEntityType;
  entityId: string;
  sharedWithUserId: string;
  reason: 'manual' | 'expired';
}

export class ContentShareRevokedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.share.revoked';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContentShareRevokedPayload;

  constructor(payload: ContentShareRevokedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.shareId;
    this.payload = payload;
  }
}
