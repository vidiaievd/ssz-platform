import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteExerciseInstructionCommand } from './delete-instruction.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_INSTRUCTION_REPOSITORY } from '../../../domain/repositories/exercise-instruction.repository.interface.js';
import type { IExerciseInstructionRepository } from '../../../domain/repositories/exercise-instruction.repository.interface.js';

@CommandHandler(DeleteExerciseInstructionCommand)
export class DeleteExerciseInstructionHandler implements ICommandHandler<
  DeleteExerciseInstructionCommand,
  Result<void, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_INSTRUCTION_REPOSITORY)
    private readonly instructionRepo: IExerciseInstructionRepository,
  ) {}

  async execute(
    command: DeleteExerciseInstructionCommand,
  ): Promise<Result<void, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    if (exercise.ownerUserId !== command.userId) {
      return Result.fail(ExerciseDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const instruction = await this.instructionRepo.findById(command.instructionId);
    if (!instruction || instruction.exerciseId !== command.exerciseId) {
      return Result.fail(ExerciseDomainError.INSTRUCTION_NOT_FOUND);
    }

    await this.instructionRepo.delete(command.instructionId);

    return Result.ok();
  }
}
