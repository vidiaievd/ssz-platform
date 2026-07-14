import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupMaterialAddedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.material.added';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
    readonly userId: string,
    readonly courseId: string,
    readonly groupStatus: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
