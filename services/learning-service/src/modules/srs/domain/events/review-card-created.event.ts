import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ReviewCardCreatedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  dueAt: string;
}

export class ReviewCardCreatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.srs.card.created';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: ReviewCardCreatedPayload,
  ) {}
}
