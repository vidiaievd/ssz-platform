import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupAssignedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.enrollment.group_assigned';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly membershipId: string,
    readonly schoolId: string,
    readonly schoolName: string,
    readonly studentId: string,
    readonly groupId: string,
    readonly groupName: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
