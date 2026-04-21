import { LessonContentVariantEntity } from '../entities/lesson-content-variant.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';

export const LESSON_CONTENT_VARIANT_REPOSITORY = Symbol('LESSON_CONTENT_VARIANT_REPOSITORY');

export interface ILessonContentVariantRepository {
  findById(id: string): Promise<LessonContentVariantEntity | null>;
  findByLessonId(lessonId: string, onlyPublished?: boolean): Promise<LessonContentVariantEntity[]>;
  findByCompositeKey(
    lessonId: string,
    explanationLanguage: string,
    minLevel: DifficultyLevel,
    maxLevel: DifficultyLevel,
  ): Promise<LessonContentVariantEntity | null>;
  save(entity: LessonContentVariantEntity): Promise<LessonContentVariantEntity>;
  delete(id: string): Promise<void>;
  /**
   * Bulk soft-delete — sets deleted_at on all variants belonging to a lesson.
   * Called by DeleteLessonHandler after the lesson itself is soft-deleted.
   */
  softDeleteByLessonId(lessonId: string): Promise<void>;
}
