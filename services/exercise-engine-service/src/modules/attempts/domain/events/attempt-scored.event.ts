import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

// Payload matches Learning Service ExerciseAttemptedConsumer contract exactly.
// Published as routing key: exercise.attempt.completed
export interface AttemptScoredPayload {
  userId: string;
  exerciseId: string;
  score: number;
  timeSpentSeconds: number;
  completed: true;
}

export class AttemptScoredEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.completed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptScoredPayload,
  ) {}
}
