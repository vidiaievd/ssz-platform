export interface ParagraphTranslationInput {
  paragraphIndex: number;
  translation: string;
}

export class SetParagraphTranslationsCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly translations: ParagraphTranslationInput[],
  ) {}
}
