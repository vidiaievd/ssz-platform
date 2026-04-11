import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TutorProfileCompletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'tutor.profile.completed';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly tutorProfileId: string,
    readonly profileId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
