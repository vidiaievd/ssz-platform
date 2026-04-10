import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class StudentProfileCompletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'student.profile.completed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly studentProfileId: string,
    readonly profileId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
