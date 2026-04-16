import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyItemUpdatedPayload {
  itemId: string;
  listId: string;
  updatedFields: string[];
}

export class VocabularyItemUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_item.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyItemUpdatedPayload;

  constructor(payload: VocabularyItemUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.itemId;
    this.payload = payload;
  }
}
