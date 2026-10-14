export class LookupWordQuery {
  constructor(
    public readonly userId: string,
    public readonly targetLanguage: string,
    public readonly translationLanguage: string,
    public readonly surfaceForm: string,
  ) {}
}
