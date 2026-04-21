import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { SharePermission } from '../value-objects/share-permission.vo.js';

export interface ContentSharedPayload {
  shareId: string;
  entityType: TaggableEntityType;
  entityId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  permission: SharePermission;
}

export class ContentSharedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.shared';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContentSharedPayload;

  constructor(payload: ContentSharedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.shareId;
    this.payload = payload;
  }
}
