import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class StudentNudgedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.student.nudged';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly studentUserId: string,
    readonly requestedBy: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
