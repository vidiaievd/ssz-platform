import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

/**
 * A submission is now waiting for a person (plan 44 §44.5).
 *
 * Separate from `exercise.attempt.completed`, which travels at the same moment:
 * that one is the learner's progress and its shape is frozen by the Learning
 * Service consumer. This one carries the review context — school, course, group —
 * that a reminder or an escalation needs in order to work out who to tell, and
 * nothing outside review consumes it.
 */
export interface AttemptRoutedForReviewPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  /** Snapshotted at attempt start; `null` means a neighbour service didn't answer. */
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  submittedAt: string;
}

export class AttemptRoutedForReviewEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.routed_for_review';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptRoutedForReviewPayload,
  ) {}
}
