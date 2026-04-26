import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface EnrollmentCreatedPayload {
  userId: string;
  containerId: string;
  schoolId: string | null;
}

export class EnrollmentCreatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.enrollment.created';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: EnrollmentCreatedPayload,
  ) {}
}
