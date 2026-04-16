export class DeleteExampleTranslationCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly exampleId: string,
    public readonly translationLanguage: string,
  ) {}
}
