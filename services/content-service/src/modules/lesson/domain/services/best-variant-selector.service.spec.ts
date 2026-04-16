import { BestVariantSelectorService } from './best-variant-selector.service.js';
import { LessonContentVariantEntity } from '../entities/lesson-content-variant.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { VariantStatus } from '../value-objects/variant-status.vo.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeVariant(
  overrides: {
    id?: string;
    explanationLanguage?: string;
    minLevel?: DifficultyLevel;
    maxLevel?: DifficultyLevel;
  } = {},
): LessonContentVariantEntity {
  const id = overrides.id ?? 'variant-' + Math.random().toString(36).slice(2);
  return LessonContentVariantEntity.reconstitute(id, {
    lessonId: 'lesson-1',
    explanationLanguage: overrides.explanationLanguage ?? 'en',
    minLevel: overrides.minLevel ?? DifficultyLevel.A1,
    maxLevel: overrides.maxLevel ?? DifficultyLevel.B2,
    displayTitle: 'Test Variant',
    displayDescription: null,
    bodyMarkdown: '# Hello',
    estimatedReadingMinutes: null,
    status: VariantStatus.PUBLISHED,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserId: 'user-1',
    lastEditedByUserId: 'user-1',
    publishedAt: new Date(),
    deletedAt: null,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BestVariantSelectorService', () => {
  describe('when variants list is empty', () => {
    it('returns null', () => {
      const result = BestVariantSelectorService.selectBestVariant({
        variants: [],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        studentKnownLanguages: [],
      });

      expect(result).toBeNull();
    });
  });

  describe('when only one variant exists', () => {
    it('returns that variant regardless of language', () => {
      const only = makeVariant({
        explanationLanguage: 'de',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.C2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [only],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.B1,
        studentKnownLanguages: [],
      });

      expect(result).not.toBeNull();
      expect(result!.variant.id).toBe(only.id);
    });
  });

  describe('level exact match', () => {
    it('selects the native-language variant when level matches exactly', () => {
      const ru = makeVariant({
        id: 'ru',
        explanationLanguage: 'ru',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });
      const en = makeVariant({
        id: 'en',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [en, ru],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        studentKnownLanguages: [],
      });

      expect(result!.variant.id).toBe('ru');
      expect(result!.fallbackUsed).toBe(false);
    });

    it('falls back to known language when native is absent', () => {
      const fr = makeVariant({
        id: 'fr',
        explanationLanguage: 'fr',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });
      const en = makeVariant({
        id: 'en',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [en, fr],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        // fr is listed first in known languages → should win over en
        studentKnownLanguages: ['fr', 'de'],
      });

      expect(result!.variant.id).toBe('fr');
      expect(result!.fallbackUsed).toBe(false);
    });

    it('respects known-language preference order (first match wins)', () => {
      const de = makeVariant({
        id: 'de',
        explanationLanguage: 'de',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });
      const fr = makeVariant({
        id: 'fr',
        explanationLanguage: 'fr',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [fr, de],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        studentKnownLanguages: ['de', 'fr'],
      });

      expect(result!.variant.id).toBe('de');
    });

    it('falls back to English when no preferred language available', () => {
      const en = makeVariant({
        id: 'en',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });
      const no = makeVariant({
        id: 'no',
        explanationLanguage: 'no',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [no, en],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        studentKnownLanguages: [],
      });

      expect(result!.variant.id).toBe('en');
    });

    it('uses target-language immersion variant when nothing else matches', () => {
      const no = makeVariant({
        id: 'no',
        explanationLanguage: 'no',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [no],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A2,
        studentKnownLanguages: [],
        targetLanguage: 'no',
      });

      expect(result!.variant.id).toBe('no');
    });
  });

  describe('level fallback', () => {
    it('falls back when student level is above all ranges, picks highest maxLevel', () => {
      // Student is C1 but variants only cover up to B2.
      const lowRange = makeVariant({
        id: 'low',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.A1,
        maxLevel: DifficultyLevel.A2,
      });
      const midRange = makeVariant({
        id: 'mid',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.B1,
        maxLevel: DifficultyLevel.B2,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [lowRange, midRange],
        studentNativeLanguage: 'en',
        studentCurrentLevel: DifficultyLevel.C1,
        studentKnownLanguages: [],
      });

      // midRange has the highest maxLevel (B2 > A2), so it wins.
      expect(result!.variant.id).toBe('mid');
      expect(result!.fallbackUsed).toBe(true);
    });

    it('falls back to lowest minLevel when student level is below all ranges', () => {
      // Student is A1 but variants start at B1.
      const highRange = makeVariant({
        id: 'high',
        explanationLanguage: 'en',
        minLevel: DifficultyLevel.B1,
        maxLevel: DifficultyLevel.C2,
      });
      const midRange = makeVariant({
        id: 'mid',
        explanationLanguage: 'de',
        minLevel: DifficultyLevel.B2,
        maxLevel: DifficultyLevel.C1,
      });

      const result = BestVariantSelectorService.selectBestVariant({
        variants: [midRange, highRange],
        studentNativeLanguage: 'ru',
        studentCurrentLevel: DifficultyLevel.A1,
        studentKnownLanguages: [],
      });

      // No variant has minLevel <= A1, so step-3 fallback: lowest minLevel = B1.
      expect(result!.variant.id).toBe('high');
      expect(result!.fallbackUsed).toBe(true);
    });
  });
});
