import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateExerciseCommand } from './create-exercise.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseTemplateDomainError } from '../../../../exercise-template/domain/exceptions/exercise-template-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';

export interface CreateExerciseResult {
  exerciseId: string;
}

type CreateExerciseError = ExerciseDomainError | ExerciseTemplateDomainError;

@CommandHandler(CreateExerciseCommand)
export class CreateExerciseHandler implements ICommandHandler<
  CreateExerciseCommand,
  Result<CreateExerciseResult, CreateExerciseError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
  ) {}

  async execute(
    command: CreateExerciseCommand,
  ): Promise<Result<CreateExerciseResult, CreateExerciseError>> {
    const template = await this.templateRepo.findById(command.exerciseTemplateId);
    if (!template) {
      return Result.fail(ExerciseTemplateDomainError.TEMPLATE_NOT_FOUND);
    }
    if (!template.isActive) {
      return Result.fail(ExerciseTemplateDomainError.TEMPLATE_NOT_ACTIVE);
    }
    if (!template.isLanguageSupported(command.targetLanguage)) {
      return Result.fail(ExerciseTemplateDomainError.LANGUAGE_NOT_SUPPORTED_BY_TEMPLATE);
    }

    const exerciseResult = ExerciseEntity.create(
      {
        exerciseTemplateId: command.exerciseTemplateId,
        templateCode: template.code,
        targetLanguage: command.targetLanguage,
        difficultyLevel: command.difficultyLevel,
        content: command.content,
        expectedAnswers: command.expectedAnswers,
        answerCheckSettings: command.answerCheckSettings,
        ownerUserId: command.userId,
        ownerSchoolId: command.ownerSchoolId,
        visibility: command.visibility,
        estimatedDurationSeconds: command.estimatedDurationSeconds,
      },
      template,
    );

    if (exerciseResult.isFail) {
      return Result.fail(exerciseResult.error);
    }

    const exercise = exerciseResult.value;
    await this.exerciseRepo.save(exercise);

    return Result.ok({ exerciseId: exercise.id });
  }
}
