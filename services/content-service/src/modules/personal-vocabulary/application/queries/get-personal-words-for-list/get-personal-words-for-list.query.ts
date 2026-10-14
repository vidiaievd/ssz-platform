/**
 * Which of a student's own words belong in a vocabulary list's deck (plan 75, D7).
 * Dispatched by the vocabulary module's list reader over the bus, so that module learns
 * of personal words through one query and nothing else.
 */
export class GetPersonalWordsForListQuery {
  constructor(
    public readonly userId: string,
    public readonly vocabularyListId: string,
  ) {}
}
