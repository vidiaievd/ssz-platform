import { VocabularyItemTranslationEntity } from '../entities/vocabulary-item-translation.entity.js';

export const VOCABULARY_ITEM_TRANSLATION_REPOSITORY = Symbol(
  'VOCABULARY_ITEM_TRANSLATION_REPOSITORY',
);

export interface IVocabularyItemTranslationRepository {
  findById(id: string): Promise<VocabularyItemTranslationEntity | null>;
  findByItemId(itemId: string): Promise<VocabularyItemTranslationEntity[]>;
  findByItemAndLanguage(
    itemId: string,
    translationLanguage: string,
  ): Promise<VocabularyItemTranslationEntity | null>;
  /**
   * Upserts by (vocabularyItemId, translationLanguage).
   * Returns the persisted entity and a flag indicating whether it was newly created.
   * The `wasCreated` flag is used by the handler to decide which domain event to emit.
   */
  upsert(
    entity: VocabularyItemTranslationEntity,
  ): Promise<{ entity: VocabularyItemTranslationEntity; wasCreated: boolean }>;
  delete(id: string): Promise<void>;
}
