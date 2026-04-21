import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TagDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.tag.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: { tagId: string };

  constructor(payload: { tagId: string }) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.tagId;
    this.payload = payload;
  }
}
