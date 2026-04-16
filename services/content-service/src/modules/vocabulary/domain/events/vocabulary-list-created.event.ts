import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyListCreatedPayload {
  listId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
  autoAddToSrs: boolean;
}

export class VocabularyListCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_list.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyListCreatedPayload;

  constructor(payload: VocabularyListCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.listId;
    this.payload = payload;
  }
}
