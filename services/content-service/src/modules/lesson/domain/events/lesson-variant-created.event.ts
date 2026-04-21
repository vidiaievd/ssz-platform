import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface LessonVariantCreatedPayload {
  lessonId: string;
  variantId: string;
  explanationLanguage: string;
  minLevel: string;
  maxLevel: string;
}

export class LessonVariantCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.lesson.variant.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: LessonVariantCreatedPayload;

  constructor(payload: LessonVariantCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.lessonId;
    this.payload = payload;
  }
}
