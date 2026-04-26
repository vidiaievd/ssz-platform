import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface EnrollmentCompletedPayload {
  userId: string;
  containerId: string;
  schoolId: string | null;
  completedAt: Date;
}

export class EnrollmentCompletedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.enrollment.completed';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: EnrollmentCompletedPayload,
  ) {}
}
