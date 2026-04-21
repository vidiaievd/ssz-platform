import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyListDeletedPayload {
  listId: string;
  ownerUserId: string;
}

export class VocabularyListDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_list.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyListDeletedPayload;

  constructor(payload: VocabularyListDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.listId;
    this.payload = payload;
  }
}
