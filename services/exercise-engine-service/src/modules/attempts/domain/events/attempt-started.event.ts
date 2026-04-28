import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AttemptStartedPayload {
  userId: string;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
  assignmentId: string | null;
  enrollmentId: string | null;
}

export class AttemptStartedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.started';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptStartedPayload,
  ) {}
}
