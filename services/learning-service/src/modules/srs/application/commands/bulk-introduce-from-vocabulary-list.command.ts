export class BulkIntroduceFromVocabularyListCommand {
  constructor(
    public readonly userId: string,
    public readonly vocabularyListId: string,
  ) {}
}
