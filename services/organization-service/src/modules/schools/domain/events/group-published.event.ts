import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class GroupPublishedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.group.published';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly groupId: string,
    readonly groupName: string,
    readonly courseId: string | null,
    readonly lang: string | null,
    readonly level: string | null,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
