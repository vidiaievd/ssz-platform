export class BatchGetVocabularyItemsForDisplayQuery {
  constructor(
    public readonly vocabularyItemIds: string[],
    public readonly translationLanguage: string,
    public readonly includeExamples: boolean,
    public readonly examplesLimit: number,
    public readonly examplesRandom: boolean,
    /**
     * Student's known languages in preference order (most preferred first).
     */
    public readonly studentKnownLanguages: string[],
  ) {}
}
