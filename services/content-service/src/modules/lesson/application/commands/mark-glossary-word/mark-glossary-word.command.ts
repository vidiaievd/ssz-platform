export class MarkGlossaryWordCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly vocabularyItemId: string,
  ) {}
}
