export class GetMyWordsReaderQuery {
  constructor(
    public readonly userId: string,
    public readonly targetLanguage: string,
    public readonly translationLanguage: string,
    public readonly includeExamples: boolean,
    public readonly examplesLimit: number,
    public readonly examplesRandom: boolean,
    public readonly studentKnownLanguages: string[],
  ) {}
}
