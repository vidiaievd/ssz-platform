import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExercisesQuery } from './get-exercises.query.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';

@QueryHandler(GetExercisesQuery)
export class GetExercisesHandler implements IQueryHandler<
  GetExercisesQuery,
  PaginatedResult<ExerciseEntity>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(query: GetExercisesQuery): Promise<PaginatedResult<ExerciseEntity>> {
    return this.exerciseRepo.findAll(query.filter);
  }
}
