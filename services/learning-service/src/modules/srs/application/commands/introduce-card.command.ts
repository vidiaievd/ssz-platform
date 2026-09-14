import type { SrsContentType, SrsSeedKind } from '../../domain/entities/review-card.entity.js';

export class IntroduceCardCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: SrsContentType,
    public readonly contentId: string,
    // When set, the card is created directly in REVIEW (skip-known seed path,
    // plan 21 §2.3/§4) instead of NEW.
    public readonly seedKind?: SrsSeedKind,
    /**
     * A card written in shadow (plan 63 phase 5): created and scheduled, but never
     * charged to the learner's daily new-card budget.
     *
     * The budget exists to cap how much new material a person is asked to carry, and
     * nobody is being asked to carry these — they are not shown anywhere. Charging
     * them would let the shadow model quietly starve the real one of its 20 cards a
     * day, which is both a worse experience and a ruined comparison.
     */
    public readonly shadow?: boolean,
  ) {}
}
