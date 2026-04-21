import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateExerciseCommand } from './update-exercise.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { ExerciseTemplateEntity } from '../../../../exercise-template/domain/entities/exercise-template.entity.js';

@CommandHandler(UpdateExerciseCommand)
export class UpdateExerciseHandler implements ICommandHandler<
  UpdateExerciseCommand,
  Result<void, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
  ) {}

  async execute(command: UpdateExerciseCommand): Promise<Result<void, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }
    if (exercise.ownerUserId !== command.userId) {
      return Result.fail(ExerciseDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Fetch template only when content/answers are being updated (for schema validation).
    let template: ExerciseTemplateEntity | undefined = undefined;
    if (command.content !== undefined || command.expectedAnswers !== undefined) {
      template = (await this.templateRepo.findById(exercise.exerciseTemplateId)) ?? undefined;
    }

    const updateResult = exercise.update(
      {
        difficultyLevel: command.difficultyLevel,
        content: command.content,
        expectedAnswers: command.expectedAnswers,
        answerCheckSettings: command.answerCheckSettings,
        visibility: command.visibility,
        estimatedDurationSeconds: command.estimatedDurationSeconds,
      },
      template,
    );

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.exerciseRepo.save(exercise);

    return Result.ok();
  }
}
