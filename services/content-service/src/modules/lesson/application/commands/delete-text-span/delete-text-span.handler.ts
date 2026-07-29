import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteTextSpanCommand } from './delete-text-span.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_TEXT_SPAN_REPOSITORY } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import { loadEditableTextVariant } from '../../services/load-editable-text-variant.service.js';

/**
 * Removes one annotation. The glossary mark of a vocab span is deliberately
 * left alone: the mark also stands for module membership, which outlives any
 * single occurrence in one paragraph. Removing a word from the glossary is
 * UnmarkGlossaryWord, which cascades the other way.
 */
@CommandHandler(DeleteTextSpanCommand)
export class DeleteTextSpanHandler implements ICommandHandler<
  DeleteTextSpanCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_TEXT_SPAN_REPOSITORY)
    private readonly spanRepo: ILessonTextSpanRepository,
  ) {}

  async execute(command: DeleteTextSpanCommand): Promise<Result<void, LessonDomainError>> {
    const context = await loadEditableTextVariant(
      { lessonRepo: this.lessonRepo, variantRepo: this.variantRepo },
      { userId: command.userId, variantId: command.variantId },
    );
    if (context.isFail) return Result.fail(context.error);

    const span = await this.spanRepo.findById(command.spanId);
    // Idempotent: an already-deleted span is a successful delete, so a
    // double-click in the authoring UI is not an error. A span belonging to a
    // different variant is not "already deleted" and must still 404.
    if (span && span.lessonContentVariantId !== command.variantId) {
      return Result.fail(LessonDomainError.SPAN_NOT_FOUND);
    }
    if (!span) return Result.ok();

    await this.spanRepo.delete(command.spanId);
    return Result.ok();
  }
}
