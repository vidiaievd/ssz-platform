import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface LessonCreatedPayload {
  lessonId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
}

export class LessonCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.lesson.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: LessonCreatedPayload;

  constructor(payload: LessonCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.lessonId;
    this.payload = payload;
  }
}
