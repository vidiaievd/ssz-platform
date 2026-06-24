import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class EnrollmentRejectedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.enrollment.rejected';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly membershipId: string,
    readonly schoolId: string,
    readonly schoolName: string,
    readonly studentId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
