import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExerciseTemplatesQuery } from './get-exercise-templates.query.js';
import { ExerciseTemplateEntity } from '../../../domain/entities/exercise-template.entity.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../domain/repositories/exercise-template.repository.interface.js';

@QueryHandler(GetExerciseTemplatesQuery)
export class GetExerciseTemplatesHandler implements IQueryHandler<
  GetExerciseTemplatesQuery,
  ExerciseTemplateEntity[]
> {
  constructor(
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
  ) {}

  async execute(query: GetExerciseTemplatesQuery): Promise<ExerciseTemplateEntity[]> {
    return this.templateRepo.findAll(query.onlyActive);
  }
}
