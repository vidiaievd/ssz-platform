import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class StudentRemovedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.student.removed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly userId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
