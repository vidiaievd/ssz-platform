import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface CourseArchivedPayload {
  containerId: string;
  ownerUserId: string;
}

// Course-level archive (Container.archive()) — distinct from ContainerArchivedEvent,
// which fires when an individual deprecated ContainerVersion is retired.
export class CourseArchivedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.course.archived';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: CourseArchivedPayload;

  constructor(payload: CourseArchivedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
