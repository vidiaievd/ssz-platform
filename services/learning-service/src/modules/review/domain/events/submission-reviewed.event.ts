import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface SubmissionReviewedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  reviewerId: string;
  decision: string;
  feedback: string | null;
  score: number | null;
}

export class SubmissionReviewedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.submission.reviewed';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: SubmissionReviewedPayload,
  ) {}
}
