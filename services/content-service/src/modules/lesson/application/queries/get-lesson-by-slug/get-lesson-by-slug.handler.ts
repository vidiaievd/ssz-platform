import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetLessonBySlugQuery } from './get-lesson-by-slug.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';

@QueryHandler(GetLessonBySlugQuery)
export class GetLessonBySlugHandler implements IQueryHandler<
  GetLessonBySlugQuery,
  Result<LessonEntity, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
  ) {}

  async execute(query: GetLessonBySlugQuery): Promise<Result<LessonEntity, LessonDomainError>> {
    const lesson = await this.lessonRepo.findBySlug(query.slug);

    if (!lesson || lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    return Result.ok(lesson);
  }
}
