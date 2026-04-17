import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetExerciseInstructionsQuery } from './get-exercise-instructions.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseInstructionEntity } from '../../../domain/entities/exercise-instruction.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_INSTRUCTION_REPOSITORY } from '../../../domain/repositories/exercise-instruction.repository.interface.js';
import type { IExerciseInstructionRepository } from '../../../domain/repositories/exercise-instruction.repository.interface.js';

@QueryHandler(GetExerciseInstructionsQuery)
export class GetExerciseInstructionsHandler implements IQueryHandler<
  GetExerciseInstructionsQuery,
  Result<ExerciseInstructionEntity[], ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_INSTRUCTION_REPOSITORY)
    private readonly instructionRepo: IExerciseInstructionRepository,
  ) {}

  async execute(
    query: GetExerciseInstructionsQuery,
  ): Promise<Result<ExerciseInstructionEntity[], ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    const instructions = await this.instructionRepo.findByExerciseId(query.exerciseId);
    return Result.ok(instructions);
  }
}
