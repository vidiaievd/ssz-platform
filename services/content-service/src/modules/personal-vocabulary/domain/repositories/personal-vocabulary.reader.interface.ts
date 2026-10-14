import type { PartOfSpeech } from '../../../vocabulary/domain/value-objects/part-of-speech.vo.js';

export const PERSONAL_VOCABULARY_READER = Symbol('IPersonalVocabularyReader');

/** A catalogue item one of whose forms is the word the student selected. */
export interface CatalogMatch {
  itemId: string;
  word: string;
  partOfSpeech: PartOfSpeech | null;
  grammaticalProperties: Record<string, unknown> | null;
  /** In the language asked for; null when the catalogue has none in it. */
  translation: string | null;
}

export interface PersonalWordView {
  entryId: string;
  vocabularyItemId: string;
  targetLanguage: string;
  /** The item's word — the dictionary form when it came from the catalogue. */
  word: string;
  surfaceForm: string;
  partOfSpeech: PartOfSpeech | null;
  translation: string | null;
  /** The item lives in the student's personal list, so the student may edit it. */
  ownWord: boolean;
  contextSentence: string | null;
  sourceVariantId: string | null;
  sourceParagraph: number | null;
  sourceCharStart: number | null;
  /**
   * The unit deck the word joins (plan 75, D7) — null for a word met outside a course, or
   * in a lesson whose module has no vocabulary list. It then lives in «My words» alone.
   */
  deck: { vocabularyListId: string; title: string } | null;
  createdAt: Date;
}

export interface ListWordsFilter {
  translationLanguage: string;
  targetLanguage?: string;
  entryIds?: string[];
}

export interface IPersonalVocabularyReader {
  /**
   * The best catalogue item for a form: one whose word is the form beats one that only
   * inflects to it, one translated into `translationLanguage` beats one that is not.
   * Never another student's personal list, never someone else's private list.
   */
  findCatalogMatch(
    matchKey: string,
    targetLanguage: string,
    translationLanguage: string,
    userId: string,
  ): Promise<CatalogMatch | null>;

  /** A live item of a list with exactly this word, or null. */
  findListItemId(vocabularyListId: string, word: string): Promise<string | null>;

  listWords(userId: string, filter: ListWordsFilter): Promise<PersonalWordView[]>;

  /**
   * Items of the student's words met in a lesson of a module whose deck this list is —
   * the module's first vocabulary list, in any version that is not archived. Oldest
   * first, so a deck grows at its end.
   */
  listItemIdsForModuleList(userId: string, vocabularyListId: string): Promise<string[]>;
}
