import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateTextSpanCommand } from './update-text-span.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_TEXT_SPAN_REPOSITORY } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import { loadEditableTextVariant } from '../../services/load-editable-text-variant.service.js';

export interface UpdateTextSpanResult {
  span: LessonTextSpanEntity;
}

@CommandHandler(UpdateTextSpanCommand)
export class UpdateTextSpanHandler implements ICommandHandler<
  UpdateTextSpanCommand,
  Result<UpdateTextSpanResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_TEXT_SPAN_REPOSITORY)
    private readonly spanRepo: ILessonTextSpanRepository,
  ) {}

  async execute(
    command: UpdateTextSpanCommand,
  ): Promise<Result<UpdateTextSpanResult, LessonDomainError>> {
    const context = await loadEditableTextVariant(
      { lessonRepo: this.lessonRepo, variantRepo: this.variantRepo },
      { variantId: command.variantId },
    );
    if (context.isFail) return Result.fail(context.error);
    const { paragraphs } = context.value;

    const span = await this.spanRepo.findById(command.spanId);
    // Checked against the variant in the path, not just by id: a span id from
    // another lesson must not be reachable through a variant the caller owns.
    if (!span || span.lessonContentVariantId !== command.variantId) {
      return Result.fail(LessonDomainError.SPAN_NOT_FOUND);
    }

    if (command.anchor) {
      const { paragraphIndex, charStart, charEnd } = command.anchor;
      const paragraph = paragraphs[paragraphIndex];
      if (paragraph === undefined) {
        return Result.fail(LessonDomainError.INVALID_PARAGRAPH_INDEX);
      }
      if (charEnd > paragraph.length) {
        return Result.fail(LessonDomainError.SPAN_RANGE_INVALID);
      }

      // Re-anchoring re-derives the snapshot: after this the span is, by
      // definition, no longer broken.
      const reanchored = span.reanchor(
        paragraphIndex,
        charStart,
        charEnd,
        paragraph.slice(charStart, charEnd),
      );
      if (reanchored.isFail) return Result.fail(reanchored.error);

      const siblings = await this.spanRepo.findByVariantId(command.variantId);
      const clashes = siblings.some(
        (other) => other.id !== span.id && other.kind === span.kind && other.overlaps(span),
      );
      if (clashes) return Result.fail(LessonDomainError.SPAN_OVERLAP);
    }

    if (command.note !== undefined) {
      span.setNote(command.note);
    }

    const saved = await this.spanRepo.save(span);
    return Result.ok({ span: saved });
  }
}
