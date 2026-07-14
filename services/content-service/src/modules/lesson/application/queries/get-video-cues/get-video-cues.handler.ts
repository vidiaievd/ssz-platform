import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVideoCuesQuery } from './get-video-cues.query.js';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';
import { LESSON_VIDEO_CUE_REPOSITORY } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';
import type { ILessonVideoCueRepository } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';

@QueryHandler(GetVideoCuesQuery)
export class GetVideoCuesHandler implements IQueryHandler<
  GetVideoCuesQuery,
  LessonVideoCueEntity[]
> {
  constructor(
    @Inject(LESSON_VIDEO_CUE_REPOSITORY)
    private readonly cueRepo: ILessonVideoCueRepository,
  ) {}

  async execute(query: GetVideoCuesQuery): Promise<LessonVideoCueEntity[]> {
    return this.cueRepo.findByVariantId(query.variantId);
  }
}
