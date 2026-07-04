import type { SrsContentType, SrsSeedKind } from '../../domain/entities/review-card.entity.js';

export class IntroduceCardCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: SrsContentType,
    public readonly contentId: string,
    // When set, the card is created directly in REVIEW (skip-known seed path,
    // plan 21 §2.3/§4) instead of NEW.
    public readonly seedKind?: SrsSeedKind,
  ) {}
}
