import type { LexiconVariant } from '../../domain/align-word.js';

export const PRONUNCIATION_LEXICON_READER = Symbol('IPronunciationLexiconReader');

/**
 * The pronunciation lexicon (plan 88, steps 1 and 4): every transcription of a word form, which
 * the aligner names Azure's sounds from. One read per passage, not per word.
 */
export interface IPronunciationLexiconReader {
  /**
   * The variants of each word by its lexical form (`lexicalWord`: lowercase, as Azure's words
   * come). A word the lexicon lacks is absent from the map; a language with no lexicon gives an
   * empty map without a query. Throws when the database cannot answer.
   */
  variantsOf(language: string, words: readonly string[]): Promise<Map<string, LexiconVariant[]>>;
}
