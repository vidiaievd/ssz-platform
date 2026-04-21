import {
  DifficultyLevel,
  compareLevels,
} from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { LessonContentVariantEntity } from '../entities/lesson-content-variant.entity.js';

export interface SelectBestVariantInput {
  /** Only published variants should be passed. */
  variants: LessonContentVariantEntity[];
  /** Student's native / explanation language preference. */
  studentNativeLanguage: string;
  /** Student's current proficiency level. */
  studentCurrentLevel: DifficultyLevel;
  /** Additional languages the student knows, in preference order. */
  studentKnownLanguages: string[];
  /**
   * The lesson's target language. Used as last-resort immersion fallback
   * when no preferred explanation language is available.
   */
  targetLanguage?: string;
}

export interface SelectBestVariantResult {
  variant: LessonContentVariantEntity;
  /** True when no variant exactly matched the student's level range. */
  fallbackUsed: boolean;
}

/**
 * Pure domain service — no @Injectable, no external dependencies.
 * All methods are static to make the service unambiguously side-effect-free.
 *
 * Algorithm (from CONTENT_SERVICE_ARCHITECTURE.md, Block 2 — Best Variant Algorithm):
 *  1. Filter by level: studentLevel ∈ [minLevel, maxLevel].
 *  2. If empty: fallback — keep variants where minLevel <= studentLevel,
 *     pick the one with the highest maxLevel (ties broken by highest minLevel).
 *  3. If still empty: pick the variant with the lowest minLevel (any level).
 *  4. Among the candidate pool, rank by explanation language priority:
 *     a. studentNativeLanguage exact match
 *     b. studentKnownLanguages (in preference order)
 *     c. 'en' (English universal fallback)
 *     d. targetLanguage (immersion)
 *     e. first available
 *  5. Return { variant, fallbackUsed } or null if variants is empty.
 */
export class BestVariantSelectorService {
  static selectBestVariant(input: SelectBestVariantInput): SelectBestVariantResult | null {
    const {
      variants,
      studentNativeLanguage,
      studentCurrentLevel,
      studentKnownLanguages,
      targetLanguage,
    } = input;

    if (variants.length === 0) {
      return null;
    }

    let fallbackUsed = false;
    let pool: LessonContentVariantEntity[];

    // ── Step 1: exact level match — studentLevel ∈ [minLevel, maxLevel] ──────
    const exactMatch = variants.filter(
      (v) =>
        compareLevels(v.minLevel, studentCurrentLevel) <= 0 &&
        compareLevels(studentCurrentLevel, v.maxLevel) <= 0,
    );

    if (exactMatch.length > 0) {
      pool = exactMatch;
    } else {
      fallbackUsed = true;

      // ── Step 2: minLevel <= studentLevel, pick highest maxLevel ─────────
      const belowCurrent = variants.filter(
        (v) => compareLevels(v.minLevel, studentCurrentLevel) <= 0,
      );

      if (belowCurrent.length > 0) {
        // Sort descending by maxLevel, then by minLevel as tiebreaker.
        pool = [...belowCurrent].sort((a, b) => {
          const byMax = compareLevels(b.maxLevel, a.maxLevel);
          if (byMax !== 0) return byMax;
          return compareLevels(b.minLevel, a.minLevel);
        });
      } else {
        // ── Step 3: no level fit at all — pick lowest minLevel ─────────────
        pool = [...variants].sort((a, b) => compareLevels(a.minLevel, b.minLevel));
      }
    }

    // ── Step 4: language priority within the candidate pool ──────────────────
    return {
      variant: BestVariantSelectorService.pickByLanguage(
        pool,
        studentNativeLanguage,
        studentKnownLanguages,
        targetLanguage,
      ),
      fallbackUsed,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private static pickByLanguage(
    pool: LessonContentVariantEntity[],
    nativeLanguage: string,
    knownLanguages: string[],
    targetLanguage?: string,
  ): LessonContentVariantEntity {
    // Priority a: exact native language match.
    const nativeMatch = pool.find((v) => v.explanationLanguage === nativeLanguage);
    if (nativeMatch) return nativeMatch;

    // Priority b: known languages in preference order.
    for (const lang of knownLanguages) {
      const known = pool.find((v) => v.explanationLanguage === lang);
      if (known) return known;
    }

    // Priority c: English universal fallback.
    const english = pool.find((v) => v.explanationLanguage === 'en');
    if (english) return english;

    // Priority d: lesson target language (immersion mode).
    if (targetLanguage) {
      const immersion = pool.find((v) => v.explanationLanguage === targetLanguage);
      if (immersion) return immersion;
    }

    // Priority e: first available.
    return pool[0];
  }
}
