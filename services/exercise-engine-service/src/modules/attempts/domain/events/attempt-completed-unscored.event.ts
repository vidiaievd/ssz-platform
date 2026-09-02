import { randomUUID } from 'node:crypto';
import type { Focus, Skill } from '@ssz/contracts';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

// Payload matches Learning Service ExerciseAttemptedConsumer contract exactly.
// Published as routing key: exercise.attempt.completed with score=null, completed=false.
//
// Named for what it is rather than what raises it: an attempt that finished
// without a score. The review side of the same moment is announced separately by
// AttemptRoutedForReviewEvent, whose payload is free to change; this one's is frozen.
export interface AttemptCompletedUnscoredPayload {
  userId: string;
  exerciseId: string;
  score: null;
  timeSpentSeconds: number;
  completed: false;
  // The axes, as on the scored event (plan 55 §3.6). Carried on this one too because a
  // free-form attempt is exactly the kind the profile most wants: writing handed to a
  // teacher is the strongest evidence the platform collects, and it arrives here first.
  skills: Skill[];
  focus: Focus[];
}

export class AttemptCompletedUnscoredEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.completed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptCompletedUnscoredPayload,
  ) {}
}
