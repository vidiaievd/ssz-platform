import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface EnrollmentUnenrolledPayload {
  userId: string;
  containerId: string;
  reason: string | null;
}

export class EnrollmentUnenrolledEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.enrollment.unenrolled';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: EnrollmentUnenrolledPayload,
  ) {}
}
