import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface CourseRestoredPayload {
  containerId: string;
  ownerUserId: string;
}

export class CourseRestoredEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.course.restored';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: CourseRestoredPayload;

  constructor(payload: CourseRestoredPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
