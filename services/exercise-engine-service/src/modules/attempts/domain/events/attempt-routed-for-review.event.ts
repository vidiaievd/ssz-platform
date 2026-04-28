import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

// Payload matches Learning Service ExerciseAttemptedConsumer contract exactly.
// Published as routing key: exercise.attempt.completed with score=null, completed=false.
export interface AttemptRoutedForReviewPayload {
  userId: string;
  exerciseId: string;
  score: null;
  timeSpentSeconds: number;
  completed: false;
}

export class AttemptRoutedForReviewEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.completed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptRoutedForReviewPayload,
  ) {}
}
