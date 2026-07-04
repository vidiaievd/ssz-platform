export class GetGlossarySuggestionsQuery {
  constructor(
    public readonly lessonId: string,
    public readonly language: string,
  ) {}
}
