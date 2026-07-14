import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetParagraphTranslationsCommand } from './set-paragraph-translations.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { MarkdownParagraphSplitterService } from '../../../domain/services/markdown-paragraph-splitter.service.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_PARAGRAPH_TRANSLATION_REPOSITORY } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import type { ILessonParagraphTranslationRepository } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';

@CommandHandler(SetParagraphTranslationsCommand)
export class SetParagraphTranslationsHandler implements ICommandHandler<
  SetParagraphTranslationsCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_PARAGRAPH_TRANSLATION_REPOSITORY)
    private readonly translationRepo: ILessonParagraphTranslationRepository,
  ) {}

  async execute(command: SetParagraphTranslationsCommand): Promise<Result<void, LessonDomainError>> {
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

    if (lesson.kind !== LessonKind.TEXT) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    const paragraphCount = MarkdownParagraphSplitterService.split(variant.bodyMarkdown).length;
    const outOfRange = command.translations.some(
      (t) => t.paragraphIndex < 0 || t.paragraphIndex >= paragraphCount,
    );
    if (outOfRange) {
      return Result.fail(LessonDomainError.INVALID_PARAGRAPH_INDEX);
    }

    await this.translationRepo.replaceForVariant(command.variantId, command.translations);

    return Result.ok();
  }
}
