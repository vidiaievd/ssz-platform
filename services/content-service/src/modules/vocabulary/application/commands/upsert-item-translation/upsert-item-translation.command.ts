export class UpsertItemTranslationCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly translationLanguage: string,
    public readonly primaryTranslation: string,
    public readonly alternativeTranslations?: string[],
    public readonly definition?: string | null,
    public readonly usageNotes?: string | null,
    public readonly falseFriendWarning?: string | null,
  ) {}
}
