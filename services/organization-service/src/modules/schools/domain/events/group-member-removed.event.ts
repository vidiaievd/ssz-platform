import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupMemberRemovedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.member.removed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
    readonly userId: string,
    readonly courseId: string | null,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
