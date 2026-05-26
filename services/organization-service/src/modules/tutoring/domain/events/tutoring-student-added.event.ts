import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TutoringStudentAddedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'tutoring.student.added';
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
