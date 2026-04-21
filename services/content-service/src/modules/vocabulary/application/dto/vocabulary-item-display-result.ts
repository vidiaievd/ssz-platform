/**
 * Application-level display DTO — assembled by the display query handlers.
 * Consumed by the presentation layer to build HTTP response DTOs.
 * Stored in Redis cache as serialized JSON.
 */

export interface ExampleTranslationDisplayResult {
  id: string;
  language: string;
  translatedText: string;
  fallbackUsed: boolean;
}

export interface ExampleDisplayResult {
  id: string;
  exampleText: string;
  position: number;
  audioMediaId: string | null;
  contextNote: string | null;
  translation: ExampleTranslationDisplayResult | null;
  immersionMode: boolean;
}

export interface ItemTranslationDisplayResult {
  id: string;
  language: string;
  primaryTranslation: string;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  falseFriendWarning: string | null;
  fallbackUsed: boolean;
}

export interface VocabularyItemDisplayResult {
  itemId: string;
  listId: string;
  word: string;
  position: number;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  grammaticalProperties: Record<string, unknown> | null;
  register: string | null;
  notes: string | null;
  translation: ItemTranslationDisplayResult | null;
  immersionMode: boolean;
  examples: ExampleDisplayResult[];
}
