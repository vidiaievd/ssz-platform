import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TeacherProfileChangedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'organization.teacher.profile_changed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly recipientId: string,
    readonly teacherUserId: string,
    readonly changedFields: string[],
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
