import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetLessonVariantsQuery } from './get-lesson-variants.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';

@QueryHandler(GetLessonVariantsQuery)
export class GetLessonVariantsHandler implements IQueryHandler<
  GetLessonVariantsQuery,
  Result<LessonContentVariantEntity[], LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
  ) {}

  async execute(
    query: GetLessonVariantsQuery,
  ): Promise<Result<LessonContentVariantEntity[], LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(query.lessonId);

    if (!lesson || lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    const variants = await this.variantRepo.findByLessonId(query.lessonId, query.onlyPublished);

    return Result.ok(variants);
  }
}
