export class ReorderVocabularyItemsCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
    public readonly items: { id: string; position: number }[],
  ) {}
}
