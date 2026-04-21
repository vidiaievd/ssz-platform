import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyListUpdatedPayload {
  listId: string;
  updatedFields: string[];
}

export class VocabularyListUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_list.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyListUpdatedPayload;

  constructor(payload: VocabularyListUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.listId;
    this.payload = payload;
  }
}
