import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpsertExerciseInstructionCommand } from './upsert-instruction.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseInstructionEntity } from '../../../domain/entities/exercise-instruction.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_INSTRUCTION_REPOSITORY } from '../../../domain/repositories/exercise-instruction.repository.interface.js';
import type { IExerciseInstructionRepository } from '../../../domain/repositories/exercise-instruction.repository.interface.js';

export interface UpsertInstructionResult {
  instructionId: string;
  wasCreated: boolean;
}

@CommandHandler(UpsertExerciseInstructionCommand)
export class UpsertExerciseInstructionHandler implements ICommandHandler<
  UpsertExerciseInstructionCommand,
  Result<UpsertInstructionResult, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_INSTRUCTION_REPOSITORY)
    private readonly instructionRepo: IExerciseInstructionRepository,
  ) {}

  async execute(
    command: UpsertExerciseInstructionCommand,
  ): Promise<Result<UpsertInstructionResult, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    if (exercise.ownerUserId !== command.userId) {
      return Result.fail(ExerciseDomainError.INSUFFICIENT_PERMISSIONS);
    }
    if (exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_ALREADY_DELETED);
    }

    const existing = await this.instructionRepo.findByExerciseAndLanguage(
      command.exerciseId,
      command.instructionLanguage,
    );

    if (existing) {
      const updateResult = existing.update({
        instructionText: command.instructionText,
        hintText: command.hintText,
        textOverrides: command.textOverrides,
      });
      if (updateResult.isFail) {
        return Result.fail(updateResult.error);
      }
      const { entity } = await this.instructionRepo.upsert(existing);
      return Result.ok({ instructionId: entity.id, wasCreated: false });
    }

    const createResult = ExerciseInstructionEntity.create({
      exerciseId: command.exerciseId,
      instructionLanguage: command.instructionLanguage,
      instructionText: command.instructionText,
      hintText: command.hintText ?? undefined,
      textOverrides: command.textOverrides ?? undefined,
    });

    if (createResult.isFail) {
      return Result.fail(createResult.error);
    }

    const { entity, wasCreated } = await this.instructionRepo.upsert(createResult.value);

    return Result.ok({ instructionId: entity.id, wasCreated });
  }
}
