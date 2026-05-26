import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TutoringStudentRemovedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'tutoring.student.removed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly tutorGroupId: string,
    readonly userId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
