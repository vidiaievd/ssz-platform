import { TranslationFallbackSelectorService } from './translation-fallback-selector.service.js';

describe('TranslationFallbackSelectorService', () => {
  const selector = new TranslationFallbackSelectorService();

  const makeTranslation = (lang: string) => ({ translationLanguage: lang });

  const BASE_INPUT = {
    studentNativeLanguage: 'ru',
    studentKnownLanguages: ['de', 'fr'],
    targetLanguage: 'no',
  };

  it('returns the native-language translation with fallbackUsed=false', () => {
    const translations = [makeTranslation('en'), makeTranslation('ru'), makeTranslation('de')];
    const result = selector.select({ ...BASE_INPUT, translations });

    expect(result.translation?.translationLanguage).toBe('ru');
    expect(result.fallbackUsed).toBe(false);
    expect(result.immersionMode).toBe(false);
  });

  it('falls back to the first matching known language in preference order', () => {
    // No 'ru', but 'de' and 'fr' are in known list (de first)
    const translations = [makeTranslation('en'), makeTranslation('fr'), makeTranslation('de')];
    const result = selector.select({ ...BASE_INPUT, translations });

    expect(result.translation?.translationLanguage).toBe('de');
    expect(result.fallbackUsed).toBe(true);
    expect(result.immersionMode).toBe(false);
  });

  it('respects known-language preference order (fr before de when de is absent)', () => {
    const translations = [makeTranslation('en'), makeTranslation('fr')];
    const result = selector.select({ ...BASE_INPUT, translations });

    expect(result.translation?.translationLanguage).toBe('fr');
    expect(result.fallbackUsed).toBe(true);
  });

  it('falls back to English when native and known languages are missing', () => {
    const translations = [makeTranslation('en'), makeTranslation('zh')];
    const result = selector.select({ ...BASE_INPUT, translations });

    expect(result.translation?.translationLanguage).toBe('en');
    expect(result.fallbackUsed).toBe(true);
    expect(result.immersionMode).toBe(false);
  });

  it('returns immersionMode=true when no translations at all', () => {
    const result = selector.select({ ...BASE_INPUT, translations: [] });

    expect(result.translation).toBeNull();
    expect(result.fallbackUsed).toBe(false);
    expect(result.immersionMode).toBe(true);
  });

  it('returns immersionMode=true when no matching translation exists at any priority', () => {
    // Only a Chinese translation — not native, not known, not English
    const translations = [makeTranslation('zh')];
    const result = selector.select({ ...BASE_INPUT, translations });

    expect(result.translation).toBeNull();
    expect(result.immersionMode).toBe(true);
  });

  it('does not treat empty knownLanguages array as an error', () => {
    const translations = [makeTranslation('en')];
    const result = selector.select({
      ...BASE_INPUT,
      studentKnownLanguages: [],
      translations,
    });

    // Native (ru) absent → known (none) → English → found
    expect(result.translation?.translationLanguage).toBe('en');
    expect(result.fallbackUsed).toBe(true);
  });
});
