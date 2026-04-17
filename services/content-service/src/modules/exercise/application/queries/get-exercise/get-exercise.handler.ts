import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExerciseQuery } from './get-exercise.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';

@QueryHandler(GetExerciseQuery)
export class GetExerciseHandler implements IQueryHandler<
  GetExerciseQuery,
  Result<ExerciseEntity, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(query: GetExerciseQuery): Promise<Result<ExerciseEntity, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    return Result.ok(exercise);
  }
}
