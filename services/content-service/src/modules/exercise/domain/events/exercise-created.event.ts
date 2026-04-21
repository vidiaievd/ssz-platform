import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ExerciseCreatedPayload {
  exerciseId: string;
  templateCode: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
}

export class ExerciseCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.exercise.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ExerciseCreatedPayload;

  constructor(payload: ExerciseCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.exerciseId;
    this.payload = payload;
  }
}
