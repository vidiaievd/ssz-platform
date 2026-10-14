import type { PersonalVocabularyEntryEntity } from '../entities/personal-vocabulary-entry.entity.js';

export const PERSONAL_VOCABULARY_REPOSITORY = Symbol('IPersonalVocabularyRepository');

export interface IPersonalVocabularyRepository {
  findEntryById(entryId: string): Promise<PersonalVocabularyEntryEntity | null>;
  findEntryByItem(
    userId: string,
    vocabularyItemId: string,
  ): Promise<PersonalVocabularyEntryEntity | null>;
  /** Insert or update by id. */
  saveEntry(entry: PersonalVocabularyEntryEntity): Promise<void>;
  deleteEntry(entryId: string): Promise<void>;

  /** The student's personal list for a language, or null before their first own word. */
  findPersonalListId(userId: string, targetLanguage: string): Promise<string | null>;
  /**
   * Marks a freshly created list as the student's personal one. Two first words arriving
   * together both create a list; only one link wins, and the id returned is the winner's.
   */
  linkPersonalList(
    userId: string,
    targetLanguage: string,
    vocabularyListId: string,
  ): Promise<string>;
}
