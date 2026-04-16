export class GetVocabularyItemForDisplayQuery {
  constructor(
    public readonly itemId: string,
    public readonly translationLanguage: string,
    public readonly includeExamples: boolean,
    public readonly examplesLimit: number,
    public readonly examplesRandom: boolean,
    /**
     * Student's known languages in preference order (most preferred first).
     * Used by TranslationFallbackSelectorService to select the best available translation.
     */
    public readonly studentKnownLanguages: string[],
  ) {}
}
