import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetBestVariantQuery } from './get-best-variant.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { BestVariantSelectorService } from '../../../domain/services/best-variant-selector.service.js';

export interface GetBestVariantResult {
  variant: LessonContentVariantEntity;
  fallbackUsed: boolean;
}

@QueryHandler(GetBestVariantQuery)
export class GetBestVariantHandler implements IQueryHandler<
  GetBestVariantQuery,
  Result<GetBestVariantResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
  ) {}

  async execute(
    query: GetBestVariantQuery,
  ): Promise<Result<GetBestVariantResult, LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(query.lessonId);

    if (!lesson || lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    // Only published variants are eligible for selection.
    const publishedVariants = await this.variantRepo.findByLessonId(query.lessonId, true);

    const selected = BestVariantSelectorService.selectBestVariant({
      variants: publishedVariants,
      studentNativeLanguage: query.studentNativeLanguage,
      studentCurrentLevel: query.studentCurrentLevel,
      studentKnownLanguages: query.studentKnownLanguages,
      targetLanguage: lesson.targetLanguage,
    });

    if (!selected) {
      return Result.fail(LessonDomainError.BEST_VARIANT_NOT_FOUND);
    }

    return Result.ok(selected);
  }
}
