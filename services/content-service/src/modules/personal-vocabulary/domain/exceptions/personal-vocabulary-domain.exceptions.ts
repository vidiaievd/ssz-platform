export enum PersonalVocabularyDomainError {
  /** Empty after trimming punctuation, longer than a vocabulary word, or several words. */
  INVALID_SURFACE_FORM = 'INVALID_SURFACE_FORM',
  ENTRY_NOT_FOUND = 'ENTRY_NOT_FOUND',
  /** The entry points at a catalogue word; a student cannot edit someone else's item. */
  CATALOG_WORD_READ_ONLY = 'CATALOG_WORD_READ_ONLY',
}
