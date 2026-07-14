import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetListeningStagesQuery } from './get-listening-stages.query.js';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import { LESSON_LISTENING_STAGE_REPOSITORY } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';

@QueryHandler(GetListeningStagesQuery)
export class GetListeningStagesHandler implements IQueryHandler<
  GetListeningStagesQuery,
  LessonListeningStageEntity[]
> {
  constructor(
    @Inject(LESSON_LISTENING_STAGE_REPOSITORY)
    private readonly stageRepo: ILessonListeningStageRepository,
  ) {}

  async execute(query: GetListeningStagesQuery): Promise<LessonListeningStageEntity[]> {
    return this.stageRepo.findByVariantId(query.variantId);
  }
}
