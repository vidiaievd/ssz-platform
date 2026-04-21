import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface LessonVariantPublishedPayload {
  lessonId: string;
  variantId: string;
  explanationLanguage: string;
  isFirstPublishedVariant: boolean;
}

export class LessonVariantPublishedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.lesson.variant.published';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: LessonVariantPublishedPayload;

  constructor(payload: LessonVariantPublishedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.lessonId;
    this.payload = payload;
  }
}
