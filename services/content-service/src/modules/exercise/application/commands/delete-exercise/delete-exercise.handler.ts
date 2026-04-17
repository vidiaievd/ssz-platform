import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteExerciseCommand } from './delete-exercise.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';

@CommandHandler(DeleteExerciseCommand)
export class DeleteExerciseHandler implements ICommandHandler<
  DeleteExerciseCommand,
  Result<void, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(command: DeleteExerciseCommand): Promise<Result<void, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    if (exercise.ownerUserId !== command.userId) {
      return Result.fail(ExerciseDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const hasRefs = await this.exerciseRepo.hasPublishedContainerReferences(command.exerciseId);
    if (hasRefs) {
      return Result.fail(ExerciseDomainError.EXERCISE_HAS_PUBLISHED_CONTAINER_REFERENCES);
    }

    const deleteResult = exercise.softDelete();
    if (deleteResult.isFail) {
      return Result.fail(deleteResult.error);
    }

    await this.exerciseRepo.save(exercise);

    return Result.ok();
  }
}
