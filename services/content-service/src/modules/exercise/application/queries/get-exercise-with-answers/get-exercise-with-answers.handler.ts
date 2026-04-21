import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExerciseWithAnswersQuery } from './get-exercise-with-answers.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';

@QueryHandler(GetExerciseWithAnswersQuery)
export class GetExerciseWithAnswersHandler implements IQueryHandler<
  GetExerciseWithAnswersQuery,
  Result<ExerciseEntity, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(
    query: GetExerciseWithAnswersQuery,
  ): Promise<Result<ExerciseEntity, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId, true);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    return Result.ok(exercise);
  }
}
