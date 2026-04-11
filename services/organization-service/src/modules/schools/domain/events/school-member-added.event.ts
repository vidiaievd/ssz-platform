import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { MemberRole } from '../value-objects/member-role.vo.js';

export class SchoolMemberAddedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.member.added';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly userId: string,
    readonly role: MemberRole,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
