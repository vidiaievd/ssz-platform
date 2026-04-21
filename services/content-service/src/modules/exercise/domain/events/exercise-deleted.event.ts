import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ExerciseDeletedPayload {
  exerciseId: string;
  ownerUserId: string;
}

export class ExerciseDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.exercise.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ExerciseDeletedPayload;

  constructor(payload: ExerciseDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.exerciseId;
    this.payload = payload;
  }
}
