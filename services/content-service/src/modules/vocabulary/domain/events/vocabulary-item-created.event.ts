import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyItemCreatedPayload {
  itemId: string;
  listId: string;
  word: string;
}

export class VocabularyItemCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_item.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyItemCreatedPayload;

  constructor(payload: VocabularyItemCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.itemId;
    this.payload = payload;
  }
}
