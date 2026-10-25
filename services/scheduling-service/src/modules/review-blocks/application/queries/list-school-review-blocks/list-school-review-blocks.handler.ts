import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolReviewBlocksQuery } from './list-school-review-blocks.query.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import { ReviewBlockAccessService } from '../../services/review-block-access.js';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
} from '../../../../slots/domain/repositories/lesson.repository.interface.js';
import { toWindow, type ReviewBlockWindow } from '../review-block-window.js';

@QueryHandler(ListSchoolReviewBlocksQuery)
export class ListSchoolReviewBlocksHandler
  implements IQueryHandler<ListSchoolReviewBlocksQuery, ReviewBlockWindow>
{
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    private readonly access: ReviewBlockAccessService,
  ) {}

  async execute(query: ListSchoolReviewBlocksQuery): Promise<ReviewBlockWindow> {
    await this.access.requireCanReadSchool(query.schoolId, query.user);
    const [all, lessons] = await Promise.all([
      this.blocks.findForSchool(query.schoolId, query.from, query.to),
      this.lessons.findBySchoolAndDateRange(query.schoolId, query.from, query.to),
    ]);
    const blocks = query.teacherId ? all.filter((b) => b.teacherId === query.teacherId) : all;
    return toWindow(blocks, query.from, query.to, lessons);
  }
}
