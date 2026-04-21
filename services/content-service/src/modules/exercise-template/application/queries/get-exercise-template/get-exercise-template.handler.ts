import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExerciseTemplateQuery } from './get-exercise-template.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseTemplateEntity } from '../../../domain/entities/exercise-template.entity.js';
import { ExerciseTemplateDomainError } from '../../../domain/exceptions/exercise-template-domain.exceptions.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../domain/repositories/exercise-template.repository.interface.js';

@QueryHandler(GetExerciseTemplateQuery)
export class GetExerciseTemplateHandler implements IQueryHandler<
  GetExerciseTemplateQuery,
  Result<ExerciseTemplateEntity, ExerciseTemplateDomainError>
> {
  constructor(
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
  ) {}

  async execute(
    query: GetExerciseTemplateQuery,
  ): Promise<Result<ExerciseTemplateEntity, ExerciseTemplateDomainError>> {
    const template = await this.templateRepo.findById(query.id);
    if (!template) {
      return Result.fail(ExerciseTemplateDomainError.TEMPLATE_NOT_FOUND);
    }
    return Result.ok(template);
  }
}
