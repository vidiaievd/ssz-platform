import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface SubmissionResubmittedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  revisionNumber: number;
}

export class SubmissionResubmittedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.submission.resubmitted';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: SubmissionResubmittedPayload,
  ) {}
}
