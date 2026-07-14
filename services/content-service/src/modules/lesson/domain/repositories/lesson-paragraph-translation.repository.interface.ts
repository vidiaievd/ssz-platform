export const LESSON_PARAGRAPH_TRANSLATION_REPOSITORY = Symbol(
  'LESSON_PARAGRAPH_TRANSLATION_REPOSITORY',
);

export interface IParagraphTranslationRow {
  paragraphIndex: number;
  translation: string;
}

export interface ILessonParagraphTranslationRepository {
  findByVariantId(variantId: string): Promise<IParagraphTranslationRow[]>;
  /**
   * Atomically replaces all paragraph translations for a variant.
   * Runs delete + createMany in a single transaction, mirroring
   * ILessonVariantMediaRefRepository.replaceForVariant.
   */
  replaceForVariant(variantId: string, rows: IParagraphTranslationRow[]): Promise<void>;
}
