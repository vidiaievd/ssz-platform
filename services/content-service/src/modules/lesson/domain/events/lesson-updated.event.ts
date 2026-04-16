import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface LessonUpdatedPayload {
  lessonId: string;
  updatedFields: string[];
}

export class LessonUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.lesson.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: LessonUpdatedPayload;

  constructor(payload: LessonUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.lessonId;
    this.payload = payload;
  }
}
