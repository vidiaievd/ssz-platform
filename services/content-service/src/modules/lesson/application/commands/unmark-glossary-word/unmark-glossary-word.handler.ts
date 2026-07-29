import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UnmarkGlossaryWordCommand } from './unmark-glossary-word.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { LESSON_TEXT_SPAN_REPOSITORY } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';

const GLOSSARY_ELIGIBLE_KINDS = new Set([LessonKind.TEXT, LessonKind.VIDEO]);

/**
 * Takes a word back out of a lesson variant's glossary — the operation the
 * mark model never had, which made marking a one-way door.
 *
 * Cascades to this variant's vocab spans for the same word: a span whose word is
 * no longer in the glossary has nothing to show in the reader's card.
 *
 * Does **not** touch the module-level INTRODUCES relation. That relation means
 * "this module teaches this word" and may have been created by another lesson in
 * the same module, or curated on the module directly; dropping it here would
 * silently remove the word from the unit's vocabulary list and from students'
 * SRS seeding because of an edit to one lesson. Detaching a word from a module
 * stays a module-level operation.
 */
@CommandHandler(UnmarkGlossaryWordCommand)
export class UnmarkGlossaryWordHandler implements ICommandHandler<
  UnmarkGlossaryWordCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_GLOSSARY_MARK_REPOSITORY)
    private readonly markRepo: ILessonGlossaryMarkRepository,
    @Inject(LESSON_TEXT_SPAN_REPOSITORY)
    private readonly spanRepo: ILessonTextSpanRepository,
  ) {}

  async execute(command: UnmarkGlossaryWordCommand): Promise<Result<void, LessonDomainError>> {
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

    if (!GLOSSARY_ELIGIBLE_KINDS.has(lesson.kind)) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    // Both calls are idempotent — unmarking a word that was never marked is a
    // successful no-op, matching the DELETE semantics the controller exposes.
    await this.spanRepo.deleteByVariantAndRef(command.variantId, command.vocabularyItemId);
    await this.markRepo.deleteMark(command.variantId, command.vocabularyItemId);

    return Result.ok();
  }
}
