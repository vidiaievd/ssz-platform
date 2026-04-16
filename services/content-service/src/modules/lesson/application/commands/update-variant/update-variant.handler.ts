import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateVariantCommand } from './update-variant.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VARIANT_MEDIA_REF_REPOSITORY } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import type { ILessonVariantMediaRefRepository } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { MarkdownMediaParserService } from '../../../domain/services/markdown-media-parser.service.js';

@CommandHandler(UpdateVariantCommand)
export class UpdateVariantHandler implements ICommandHandler<
  UpdateVariantCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VARIANT_MEDIA_REF_REPOSITORY)
    private readonly mediaRefRepo: ILessonVariantMediaRefRepository,
  ) {}

  async execute(command: UpdateVariantCommand): Promise<Result<void, LessonDomainError>> {
    const variant = await this.variantRepo.findById(command.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    if (variant.deletedAt !== null) {
      return Result.fail(LessonDomainError.VARIANT_ALREADY_DELETED);
    }

    const lesson = await this.lessonRepo.findById(variant.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const updateResult = variant.update(
      {
        displayTitle: command.displayTitle,
        displayDescription: command.displayDescription,
        bodyMarkdown: command.bodyMarkdown,
        estimatedReadingMinutes: command.estimatedReadingMinutes,
      },
      command.userId,
    );

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.variantRepo.save(variant);

    // Re-parse media refs if bodyMarkdown was updated.
    if (command.bodyMarkdown !== undefined) {
      const refs = MarkdownMediaParserService.parse(command.bodyMarkdown);
      await this.mediaRefRepo.replaceForVariant(variant.id, refs);
    }

    return Result.ok();
  }
}
