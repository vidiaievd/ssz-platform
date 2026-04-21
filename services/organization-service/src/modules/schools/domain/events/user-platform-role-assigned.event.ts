import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class UserPlatformRoleAssignedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'user.platform.role.assigned';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly userId: string,
    readonly platformRole: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
