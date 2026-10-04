import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

/**
 * An exercise's draft reached students through a container publish — plan 68.
 *
 * Carries the pieces the released document has (`itemsOf` of the kernel), so that state
 * kept per piece elsewhere can let go of the ones the edit deleted. `null` for a template
 * that grades as a whole and keeps nothing per piece.
 */
export interface ExerciseReleasedPayload {
  exerciseId: string;
  templateCode: string;
  itemKeys: string[] | null;
}

export class ExerciseReleasedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.exercise.released';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ExerciseReleasedPayload;

  constructor(payload: ExerciseReleasedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.exerciseId;
    this.payload = payload;
  }
}
