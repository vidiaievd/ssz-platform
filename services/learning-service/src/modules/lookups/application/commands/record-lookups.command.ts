export interface LookupInput {
  lessonId: string;
  lessonVariantId: string;
  vocabularyItemId: string;
  level: 'preview' | 'full';
  /** When the learner opened the card, as reported by the reader. */
  occurredAt: string;
}

/**
 * A batch of word-card openings reported by the reader (web spec 18).
 * Carries no state change: the handler resolves the learner's SRS state and
 * publishes one event per lookup.
 */
export class RecordLookupsCommand {
  constructor(
    public readonly userId: string,
    public readonly lookups: LookupInput[],
  ) {}
}
