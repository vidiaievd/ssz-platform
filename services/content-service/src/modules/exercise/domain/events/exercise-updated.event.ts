import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ExerciseUpdatedPayload {
  exerciseId: string;
  updatedFields: string[];
}

export class ExerciseUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.exercise.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ExerciseUpdatedPayload;

  constructor(payload: ExerciseUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.exerciseId;
    this.payload = payload;
  }
}
