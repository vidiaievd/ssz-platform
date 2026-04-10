import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class SchoolMemberRemovedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.member.removed';
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
