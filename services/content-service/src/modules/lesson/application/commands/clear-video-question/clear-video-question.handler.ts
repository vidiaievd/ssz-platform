import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ClearVideoQuestionCommand } from './clear-video-question.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VIDEO_QUESTION_REPOSITORY } from '../../../domain/repositories/lesson-video-question.repository.interface.js';
import type { ILessonVideoQuestionRepository } from '../../../domain/repositories/lesson-video-question.repository.interface.js';

@CommandHandler(ClearVideoQuestionCommand)
export class ClearVideoQuestionHandler implements ICommandHandler<
  ClearVideoQuestionCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VIDEO_QUESTION_REPOSITORY)
    private readonly questionRepo: ILessonVideoQuestionRepository,
  ) {}

  async execute(command: ClearVideoQuestionCommand): Promise<Result<void, LessonDomainError>> {
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

    await this.questionRepo.deleteForVariant(command.variantId);

    return Result.ok();
  }
}
