import { Injectable } from '@nestjs/common';

/**
 * Minimal shape required for fallback selection.
 * Both VocabularyItemTranslationEntity and VocabularyExampleTranslationEntity
 * satisfy this interface.
 */
export interface TranslatableEntry {
  translationLanguage: string;
}

export interface FallbackSelectionResult<T extends TranslatableEntry> {
  translation: T | null;
  fallbackUsed: boolean;
  /** true when no translation is available at all — display word/example in target language only */
  immersionMode: boolean;
}

/**
 * Selects the best available translation for a vocabulary item or usage example
 * according to the following priority chain:
 *
 *   1. Student's native language (exact match)          → fallbackUsed: false
 *   2. Any of student's known languages (in preference  → fallbackUsed: true
 *      order, first match wins)
 *   3. English ('en')                                   → fallbackUsed: true
 *   4. No translation available                         → immersionMode: true
 *
 * The same selector is used for item translations and example translations.
 * Registered as a provider for DI convenience; contains no side effects.
 */
@Injectable()
export class TranslationFallbackSelectorService {
  select<T extends TranslatableEntry>(input: {
    translations: T[];
    studentNativeLanguage: string;
    /** Languages the student knows, in preference order (most preferred first). */
    studentKnownLanguages: string[];
    targetLanguage: string;
  }): FallbackSelectionResult<T> {
    const { translations, studentNativeLanguage, studentKnownLanguages } = input;

    if (translations.length === 0) {
      return { translation: null, fallbackUsed: false, immersionMode: true };
    }

    // Priority 1: native language
    const native = translations.find((t) => t.translationLanguage === studentNativeLanguage);
    if (native) {
      return { translation: native, fallbackUsed: false, immersionMode: false };
    }

    // Priority 2: known languages in preference order
    for (const lang of studentKnownLanguages) {
      const known = translations.find((t) => t.translationLanguage === lang);
      if (known) {
        return { translation: known, fallbackUsed: true, immersionMode: false };
      }
    }

    // Priority 3: English
    const english = translations.find((t) => t.translationLanguage === 'en');
    if (english) {
      return { translation: english, fallbackUsed: true, immersionMode: false };
    }

    // Priority 4: immersion — no usable translation found
    return { translation: null, fallbackUsed: false, immersionMode: true };
  }
}
