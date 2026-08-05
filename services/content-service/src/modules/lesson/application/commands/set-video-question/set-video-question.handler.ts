import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetVideoQuestionCommand } from './set-video-question.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonVideoQuestionEntity } from '../../../domain/entities/lesson-video-question.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VIDEO_QUESTION_REPOSITORY } from '../../../domain/repositories/lesson-video-question.repository.interface.js';
import type { ILessonVideoQuestionRepository } from '../../../domain/repositories/lesson-video-question.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

export interface SetVideoQuestionResult {
  questionId: string;
}

@CommandHandler(SetVideoQuestionCommand)
export class SetVideoQuestionHandler implements ICommandHandler<
  SetVideoQuestionCommand,
  Result<SetVideoQuestionResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VIDEO_QUESTION_REPOSITORY)
    private readonly questionRepo: ILessonVideoQuestionRepository,
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(
    command: SetVideoQuestionCommand,
  ): Promise<Result<SetVideoQuestionResult, LessonDomainError>> {
    const variant = await this.variantRepo.findById(command.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const lesson = await this.lessonRepo.findById(variant.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.kind !== LessonKind.VIDEO) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(LessonDomainError.EXERCISE_NOT_FOUND);
    }

    const existing = await this.questionRepo.findByVariantId(command.variantId);
    const entity = LessonVideoQuestionEntity.create(
      { lessonContentVariantId: command.variantId, exerciseId: command.exerciseId },
      existing?.id,
    );

    const saved = await this.questionRepo.upsertForVariant(entity);

    return Result.ok({ questionId: saved.id });
  }
}
