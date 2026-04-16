export class DeleteVocabularyListCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
  ) {}
}
