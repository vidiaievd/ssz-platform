import type { SrsSeedKind } from '../../domain/entities/review-card.entity.js';

export class BulkIntroduceFromVocabularyListCommand {
  constructor(
    public readonly userId: string,
    public readonly vocabularyListId: string,
    // Set for skip-known tap-through (plan 21 §4.2) — seeds every item's card
    // directly in REVIEW instead of NEW.
    public readonly seedKind?: SrsSeedKind,
  ) {}
}
