import { VocabularyExampleTranslationEntity } from '../entities/vocabulary-example-translation.entity.js';

export const VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY = Symbol(
  'VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY',
);

export interface IVocabularyExampleTranslationRepository {
  findById(id: string): Promise<VocabularyExampleTranslationEntity | null>;
  findByExampleId(exampleId: string): Promise<VocabularyExampleTranslationEntity[]>;
  findByExampleAndLanguage(
    exampleId: string,
    translationLanguage: string,
  ): Promise<VocabularyExampleTranslationEntity | null>;
  upsert(entity: VocabularyExampleTranslationEntity): Promise<VocabularyExampleTranslationEntity>;
  delete(id: string): Promise<void>;
}
