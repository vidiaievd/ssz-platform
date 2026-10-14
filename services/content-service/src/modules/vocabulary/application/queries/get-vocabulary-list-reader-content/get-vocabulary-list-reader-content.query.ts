export class GetVocabularyListReaderContentQuery {
  constructor(
    public readonly listId: string,
    public readonly translationLanguage: string,
    public readonly includeExamples: boolean,
    public readonly examplesLimit: number,
    public readonly examplesRandom: boolean,
    public readonly studentKnownLanguages: string[],
    /**
     * The reader. When given, the student's own words met in this list's module are
     * appended to the list's items, marked `personal` (plan 75, D7).
     */
    public readonly userId?: string,
  ) {}
}
