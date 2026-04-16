import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateLessonCommand } from './update-lesson.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';

@CommandHandler(UpdateLessonCommand)
export class UpdateLessonHandler implements ICommandHandler<
  UpdateLessonCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
  ) {}

  async execute(command: UpdateLessonCommand): Promise<Result<void, LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(command.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check via OrganizationService.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const updateResult = lesson.update({
      title: command.title,
      description: command.description,
      difficultyLevel: command.difficultyLevel,
      coverImageMediaId: command.coverImageMediaId,
      visibility: command.visibility,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.lessonRepo.save(lesson);

    return Result.ok();
  }
}
