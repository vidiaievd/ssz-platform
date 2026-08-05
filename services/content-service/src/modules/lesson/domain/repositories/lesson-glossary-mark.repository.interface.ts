export const LESSON_GLOSSARY_MARK_REPOSITORY = Symbol('LESSON_GLOSSARY_MARK_REPOSITORY');

export interface GlossaryMarkRow {
  id: string;
  vocabularyItemId: string;
  occurrenceCount: number;
}

export interface ILessonGlossaryMarkRepository {
  findByVariantId(variantId: string): Promise<GlossaryMarkRow[]>;
  /**
   * Upserts the mark: creates it with occurrenceCount = 1, or increments
   * occurrenceCount by 1 if the (variant, vocabularyItem) pair already exists.
   */
  upsertMark(variantId: string, vocabularyItemId: string): Promise<GlossaryMarkRow>;
  /**
   * Removes the mark entirely, whatever its occurrenceCount. Resolves silently
   * when there is nothing to remove, so unmarking is idempotent.
   */
  deleteMark(variantId: string, vocabularyItemId: string): Promise<void>;
}
