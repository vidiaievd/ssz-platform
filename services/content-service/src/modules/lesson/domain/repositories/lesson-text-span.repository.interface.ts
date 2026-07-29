import { LessonTextSpanEntity } from '../entities/lesson-text-span.entity.js';

export const LESSON_TEXT_SPAN_REPOSITORY = Symbol('LESSON_TEXT_SPAN_REPOSITORY');

export interface ILessonTextSpanRepository {
  /** Ordered by (paragraphIndex, charStart) — the order the reader renders in. */
  findByVariantId(variantId: string): Promise<LessonTextSpanEntity[]>;

  findById(id: string): Promise<LessonTextSpanEntity | null>;

  /** Upserts by id: used for both create and re-anchor/note updates. */
  save(span: LessonTextSpanEntity): Promise<LessonTextSpanEntity>;

  /** Hard delete. Resolves silently when the span is already gone. */
  delete(id: string): Promise<void>;

  /** Removes a referent's spans from one variant. Returns how many were deleted. */
  deleteByVariantAndRef(variantId: string, refId: string): Promise<number>;
}
