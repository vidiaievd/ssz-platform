import type { SrsContentType } from '../../domain/entities/review-card.entity.js';

/**
 * Bulk lookup of the current user's SRS card states for a set of content ids.
 * Used by the reader to adapt glossing intensity to what the learner already
 * knows (web plan 31 §C1) — one request per text instead of one per word.
 */
export class GetCardStatesQuery {
  constructor(
    public readonly userId: string,
    public readonly contentType: SrsContentType,
    public readonly contentIds: string[],
  ) {}
}
