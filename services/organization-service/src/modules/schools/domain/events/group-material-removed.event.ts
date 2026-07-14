import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupMaterialRemovedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.material.removed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
    readonly userId: string,
    readonly courseId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
