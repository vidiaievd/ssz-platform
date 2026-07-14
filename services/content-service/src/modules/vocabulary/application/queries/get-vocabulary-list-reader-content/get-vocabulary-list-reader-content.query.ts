export class GetVocabularyListReaderContentQuery {
  constructor(
    public readonly listId: string,
    public readonly translationLanguage: string,
    public readonly includeExamples: boolean,
    public readonly examplesLimit: number,
    public readonly examplesRandom: boolean,
    public readonly studentKnownLanguages: string[],
  ) {}
}
