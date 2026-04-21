import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface LessonDeletedPayload {
  lessonId: string;
  ownerUserId: string;
}

export class LessonDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.lesson.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: LessonDeletedPayload;

  constructor(payload: LessonDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.lessonId;
    this.payload = payload;
  }
}
