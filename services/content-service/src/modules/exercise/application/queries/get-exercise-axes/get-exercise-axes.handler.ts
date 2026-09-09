import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { DerivedProfile } from '@ssz/shared-kernel/skills';
import { GetExerciseAxesQuery } from './get-exercise-axes.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_AXES } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

@QueryHandler(GetExerciseAxesQuery)
export class GetExerciseAxesHandler implements IQueryHandler<
  GetExerciseAxesQuery,
  Result<DerivedProfile, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_AXES)
    private readonly axes: IExerciseAxes,
  ) {}

  async execute(query: GetExerciseAxesQuery): Promise<Result<DerivedProfile, ExerciseDomainError>> {
    const derived = await this.axes.forExercise(query.exerciseId, query.scope);
    return derived === null
      ? Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND)
      : Result.ok(derived);
  }
}
