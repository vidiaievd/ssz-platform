import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateListeningStageCommand } from './create-listening-stage.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_LISTENING_STAGE_REPOSITORY } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

export interface CreateListeningStageResult {
  stageId: string;
}

@CommandHandler(CreateListeningStageCommand)
export class CreateListeningStageHandler implements ICommandHandler<
  CreateListeningStageCommand,
  Result<CreateListeningStageResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_LISTENING_STAGE_REPOSITORY)
    private readonly stageRepo: ILessonListeningStageRepository,
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(
    command: CreateListeningStageCommand,
  ): Promise<Result<CreateListeningStageResult, LessonDomainError>> {
    const variant = await this.variantRepo.findById(command.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const lesson = await this.lessonRepo.findById(variant.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    if (lesson.kind !== LessonKind.AUDIO) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(LessonDomainError.EXERCISE_NOT_FOUND);
    }

    const existing = await this.stageRepo.findByVariantAndPosition(
      command.variantId,
      command.position,
    );
    if (existing) {
      return Result.fail(LessonDomainError.DUPLICATE_STAGE_POSITION);
    }

    const stageResult = LessonListeningStageEntity.create({
      lessonContentVariantId: command.variantId,
      exerciseId: command.exerciseId,
      position: command.position,
      stageType: command.stageType,
    });

    if (stageResult.isFail) {
      return Result.fail(stageResult.error);
    }

    const stage = await this.stageRepo.save(stageResult.value);

    return Result.ok({ stageId: stage.id });
  }
}
