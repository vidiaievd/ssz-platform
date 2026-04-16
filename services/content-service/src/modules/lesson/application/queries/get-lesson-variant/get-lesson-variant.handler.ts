import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetLessonVariantQuery } from './get-lesson-variant.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';

@QueryHandler(GetLessonVariantQuery)
export class GetLessonVariantHandler implements IQueryHandler<
  GetLessonVariantQuery,
  Result<LessonContentVariantEntity, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
  ) {}

  async execute(
    query: GetLessonVariantQuery,
  ): Promise<Result<LessonContentVariantEntity, LessonDomainError>> {
    const variant = await this.variantRepo.findById(query.variantId);

    if (!variant || variant.deletedAt !== null) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    return Result.ok(variant);
  }
}
