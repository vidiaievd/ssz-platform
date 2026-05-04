import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ReviewCardSuspendedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  suspended: boolean;
}

export class ReviewCardSuspendedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.srs.card.suspended';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: ReviewCardSuspendedPayload,
  ) {}
}
