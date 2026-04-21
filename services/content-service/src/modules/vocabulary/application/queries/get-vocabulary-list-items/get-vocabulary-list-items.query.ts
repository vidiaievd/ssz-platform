export class GetVocabularyListItemsQuery {
  constructor(
    public readonly listId: string,
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
