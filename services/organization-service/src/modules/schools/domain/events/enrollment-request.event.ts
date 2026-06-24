import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class EnrollmentRequestEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.enrollment.requested';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly membershipId: string,
    readonly schoolId: string,
    readonly schoolName: string,
    readonly studentId: string,
    readonly adminIds: string[],
    readonly studentName: string,
    readonly source: string,
    readonly studentAvatarUrl?: string,
    readonly studentEmail?: string,
    readonly language?: string,
    readonly ageBand?: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
