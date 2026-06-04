import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupArchivedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.archived';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
