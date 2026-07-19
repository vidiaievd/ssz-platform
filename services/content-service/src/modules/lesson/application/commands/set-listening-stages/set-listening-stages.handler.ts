import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetListeningStagesCommand } from './set-listening-stages.command.js';
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

@CommandHandler(SetListeningStagesCommand)
export class SetListeningStagesHandler implements ICommandHandler<
  SetListeningStagesCommand,
  Result<void, LessonDomainError>
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

  async execute(command: SetListeningStagesCommand): Promise<Result<void, LessonDomainError>> {
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

    const positions = new Set<number>();
    const stages: LessonListeningStageEntity[] = [];
    for (const input of command.stages) {
      if (positions.has(input.position)) {
        return Result.fail(LessonDomainError.DUPLICATE_STAGE_POSITION);
      }
      positions.add(input.position);

      const exercise = await this.exerciseRepo.findById(input.exerciseId);
      if (!exercise || exercise.deletedAt !== null) {
        return Result.fail(LessonDomainError.EXERCISE_NOT_FOUND);
      }

      const stageResult = LessonListeningStageEntity.create({
        lessonContentVariantId: command.variantId,
        exerciseId: input.exerciseId,
        position: input.position,
        stageType: input.stageType,
      });
      if (stageResult.isFail) {
        return Result.fail(stageResult.error);
      }
      stages.push(stageResult.value);
    }

    await this.stageRepo.replaceForVariant(command.variantId, stages);

    return Result.ok();
  }
}
