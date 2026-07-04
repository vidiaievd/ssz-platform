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
  // PRACTICED_BY atoms snapshotted from Content Service at attempt start (plan 21 §3
  // fan-out) — lets the consumer rate the related VOCABULARY_WORD SRS cards without
  // a cross-service call in the hot path.
  practicedAtoms: Array<{ atomType: string; atomId: string }>;
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
