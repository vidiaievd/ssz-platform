import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupMemberAddedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.member.added';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
    readonly userId: string,
    readonly courseId: string | null,
    readonly groupStatus: string,
    readonly addedAt: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
