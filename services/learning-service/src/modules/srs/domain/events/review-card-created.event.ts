import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ReviewCardCreatedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  dueAt: string;
  // Present only when the card was created via the skip-known seed path
  // (ReviewCard.createSeeded) rather than normal introduction.
  seedKind?: 'DIAGNOSTIC_KNOWN' | 'CLAIMED_KNOWN';
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
