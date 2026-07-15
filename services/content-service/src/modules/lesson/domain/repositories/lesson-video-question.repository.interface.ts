import { LessonVideoQuestionEntity } from '../entities/lesson-video-question.entity.js';

export const LESSON_VIDEO_QUESTION_REPOSITORY = Symbol('LESSON_VIDEO_QUESTION_REPOSITORY');

export interface ILessonVideoQuestionRepository {
  findByVariantId(variantId: string): Promise<LessonVideoQuestionEntity | null>;
  /** Upserts the single comprehension-question link for a variant. */
  upsertForVariant(entity: LessonVideoQuestionEntity): Promise<LessonVideoQuestionEntity>;
  /** No-ops if no link exists for the variant. */
  deleteForVariant(variantId: string): Promise<void>;
}
