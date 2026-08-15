import { randomUUID } from 'node:crypto';
import type { ExerciseAttemptReviewedPayload } from '@ssz/contracts';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

/**
 * A person has marked a submission — plan 42.
 *
 * Raised alongside `AttemptScoredEvent` on an approval rather than instead of it: that
 * one is progress, and the SRS has been waiting on this verdict since the attempt was
 * routed. This one is the letter back to the learner, and it is also raised when the work
 * is sent back, where there is no score to publish and nothing else would be said at all.
 */
export class AttemptReviewedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.reviewed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: ExerciseAttemptReviewedPayload,
  ) {}
}
