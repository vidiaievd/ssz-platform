import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListTeacherReviewBlocksQuery } from './list-teacher-review-blocks.query.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
} from '../../../../slots/domain/repositories/lesson.repository.interface.js';
import { toWindow, type ReviewBlockWindow } from '../review-block-window.js';

/** One teacher's blocks across every school they mark in — whose schedule is the caller's business. */
@QueryHandler(ListTeacherReviewBlocksQuery)
export class ListTeacherReviewBlocksHandler
  implements IQueryHandler<ListTeacherReviewBlocksQuery, ReviewBlockWindow>
{
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
  ) {}

  async execute(query: ListTeacherReviewBlocksQuery): Promise<ReviewBlockWindow> {
    const [blocks, lessons] = await Promise.all([
      this.blocks.findForTeacher(query.teacherId, query.from, query.to),
      this.lessons.findByTeacherAndDateRange(query.teacherId, query.from, query.to),
    ]);
    return toWindow(blocks, query.from, query.to, lessons);
  }
}
