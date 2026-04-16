export class DeleteVocabularyItemCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
    public readonly itemId: string,
  ) {}
}
