import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface SubmissionCreatedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
}

export class SubmissionCreatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.submission.created';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: SubmissionCreatedPayload,
  ) {}
}
