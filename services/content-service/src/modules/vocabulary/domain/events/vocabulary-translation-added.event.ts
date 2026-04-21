import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VocabularyTranslationAddedPayload {
  itemId: string;
  listId: string;
  translationLanguage: string;
}

export class VocabularyTranslationAddedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.vocabulary_translation.added';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VocabularyTranslationAddedPayload;

  constructor(payload: VocabularyTranslationAddedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.itemId;
    this.payload = payload;
  }
}
