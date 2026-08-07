import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ExerciseUpdatedPayload {
  exerciseId: string;
  updatedFields: string[];
  /**
   * Whether students are seeing this change already. False for an edit to the
   * document, which waits in the draft until the container placing the exercise
   * is published — a consumer that invalidates a cache of live content wants
   * only the released ones.
   */
  released: boolean;
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
