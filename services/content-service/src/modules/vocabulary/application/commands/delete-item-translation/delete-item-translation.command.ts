export class DeleteItemTranslationCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly translationLanguage: string,
  ) {}
}
