import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { TagCategory } from '../value-objects/tag-category.vo.js';
import type { TagScope } from '../value-objects/tag-scope.vo.js';

export interface TagCreatedPayload {
  tagId: string;
  slug: string;
  name: string;
  category: TagCategory;
  scope: TagScope;
  ownerSchoolId: string | null;
  createdByUserId: string;
}

export class TagCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.tag.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: TagCreatedPayload;

  constructor(payload: TagCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.tagId;
    this.payload = payload;
  }
}
