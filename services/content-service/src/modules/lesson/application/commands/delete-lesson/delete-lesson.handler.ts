import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteLessonCommand } from './delete-lesson.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';

@CommandHandler(DeleteLessonCommand)
export class DeleteLessonHandler implements ICommandHandler<
  DeleteLessonCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
  ) {}

  async execute(command: DeleteLessonCommand): Promise<Result<void, LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(command.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check via OrganizationService.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Block delete if the lesson is referenced by any published or deprecated container version.
    // Draft references are allowed but will cause a publish failure at the container level.
    const hasRefs = await this.lessonRepo.hasPublishedContainerReferences(command.lessonId);
    if (hasRefs) {
      return Result.fail(LessonDomainError.LESSON_HAS_PUBLISHED_REFERENCES);
    }

    // Raise LessonDeletedEvent on the aggregate; published by lessonRepo.save() below.
    const deleteResult = lesson.softDelete();
    if (deleteResult.isFail) {
      return Result.fail(deleteResult.error);
    }

    // Persist lesson soft-delete and publish LessonDeletedEvent.
    await this.lessonRepo.save(lesson);

    // Cascade soft-delete to all non-deleted variants.
    // No per-variant events are published — the lesson-level event is sufficient.
    await this.variantRepo.softDeleteByLessonId(command.lessonId);

    return Result.ok();
  }
}
