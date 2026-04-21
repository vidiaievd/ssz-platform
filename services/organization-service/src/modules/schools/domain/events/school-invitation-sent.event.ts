import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { MemberRole } from '../value-objects/member-role.vo.js';

export class SchoolInvitationSentEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.invitation.sent';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly inviteeEmail: string,
    readonly schoolRole: MemberRole,
    readonly invitationToken: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
