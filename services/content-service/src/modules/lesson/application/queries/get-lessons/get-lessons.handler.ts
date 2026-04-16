import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetLessonsQuery } from './get-lessons.query.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';

@QueryHandler(GetLessonsQuery)
export class GetLessonsHandler implements IQueryHandler<
  GetLessonsQuery,
  PaginatedResult<LessonEntity>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
  ) {}

  async execute(query: GetLessonsQuery): Promise<PaginatedResult<LessonEntity>> {
    return this.lessonRepo.findAll(query.filter);
  }
}
