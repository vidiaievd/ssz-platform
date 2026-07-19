import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVideoQuestionQuery } from './get-video-question.query.js';
import { LessonVideoQuestionEntity } from '../../../domain/entities/lesson-video-question.entity.js';
import { LESSON_VIDEO_QUESTION_REPOSITORY } from '../../../domain/repositories/lesson-video-question.repository.interface.js';
import type { ILessonVideoQuestionRepository } from '../../../domain/repositories/lesson-video-question.repository.interface.js';

@QueryHandler(GetVideoQuestionQuery)
export class GetVideoQuestionHandler implements IQueryHandler<
  GetVideoQuestionQuery,
  LessonVideoQuestionEntity | null
> {
  constructor(
    @Inject(LESSON_VIDEO_QUESTION_REPOSITORY)
    private readonly questionRepo: ILessonVideoQuestionRepository,
  ) {}

  async execute(query: GetVideoQuestionQuery): Promise<LessonVideoQuestionEntity | null> {
    return this.questionRepo.findByVariantId(query.variantId);
  }
}
