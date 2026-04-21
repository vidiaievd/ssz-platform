import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TagUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.tag.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: { tagId: string; updatedFields: string[] };

  constructor(payload: { tagId: string; updatedFields: string[] }) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.tagId;
    this.payload = payload;
  }
}
