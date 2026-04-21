import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyItemDeletedPayload {
  itemId: string;
  listId: string;
}

export class VocabularyItemDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_item.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyItemDeletedPayload;

  constructor(payload: VocabularyItemDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.itemId;
    this.payload = payload;
  }
}
