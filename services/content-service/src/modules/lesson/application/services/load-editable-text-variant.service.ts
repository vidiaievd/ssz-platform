import { Result } from '../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../domain/value-objects/lesson-kind.vo.js';
import { MarkdownParagraphSplitterService } from '../../domain/services/markdown-paragraph-splitter.service.js';
import type { ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { LessonEntity } from '../../domain/entities/lesson.entity.js';
import type { LessonContentVariantEntity } from '../../domain/entities/lesson-content-variant.entity.js';

export interface EditableTextVariant {
  lesson: LessonEntity;
  variant: LessonContentVariantEntity;
  /** The body as the span offsets see it — one entry per paragraphIndex. */
  paragraphs: string[];
}

/**
 * The preamble every text-span write shares: resolve the variant and its lesson,
 * check the lesson is TEXT-kind, and split the body once so offsets can be
 * validated against it. Authorization is the guard's — see
 * `presentation/controllers/access-coverage.spec.ts`.
 *
 * Spans are TEXT-only: `paragraphIndex` is defined by the paragraph splitter,
 * which only runs on `bodyMarkdown`. A VIDEO variant's text lives in cue rows
 * with their own numbering and would need a different anchor column; VIDEO keeps
 * the positionless glossary marks.
 */
export async function loadEditableTextVariant(
  deps: { lessonRepo: ILessonRepository; variantRepo: ILessonContentVariantRepository },
  params: { variantId: string },
): Promise<Result<EditableTextVariant, LessonDomainError>> {
  const variant = await deps.variantRepo.findById(params.variantId);
  if (!variant) {
    return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
  }

  const lesson = await deps.lessonRepo.findById(variant.lessonId);
  if (!lesson) {
    return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
  }

  if (lesson.kind !== LessonKind.TEXT) {
    return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
  }

  return Result.ok({
    lesson,
    variant,
    paragraphs: MarkdownParagraphSplitterService.split(variant.bodyMarkdown),
  });
}
