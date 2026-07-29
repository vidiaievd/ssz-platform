import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { MarkGlossaryWordCommand } from './mark-glossary-word.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type {
  GlossaryMarkRow,
  ILessonGlossaryMarkRepository,
} from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import { CONTENT_RELATION_REPOSITORY } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';
import type { IContentRelationRepository } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';
import { syncModuleGlossary } from '../../services/module-glossary-sync.service.js';

const GLOSSARY_ELIGIBLE_KINDS = new Set([LessonKind.TEXT, LessonKind.VIDEO]);

export interface MarkGlossaryWordResult {
  mark: GlossaryMarkRow;
}

@CommandHandler(MarkGlossaryWordCommand)
export class MarkGlossaryWordHandler implements ICommandHandler<
  MarkGlossaryWordCommand,
  Result<MarkGlossaryWordResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_GLOSSARY_MARK_REPOSITORY)
    private readonly markRepo: ILessonGlossaryMarkRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly vocabularyItemRepo: IVocabularyItemRepository,
    @Inject(CONTENT_RELATION_REPOSITORY)
    private readonly contentRelationRepo: IContentRelationRepository,
  ) {}

  async execute(
    command: MarkGlossaryWordCommand,
  ): Promise<Result<MarkGlossaryWordResult, LessonDomainError>> {
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

    const vocabularyItem = await this.vocabularyItemRepo.findById(command.vocabularyItemId);
    if (!vocabularyItem || vocabularyItem.deletedAt !== null) {
      return Result.fail(LessonDomainError.VOCABULARY_ITEM_NOT_FOUND);
    }

    const mark = await this.markRepo.upsertMark(command.variantId, command.vocabularyItemId);

    // Shared with CreateTextSpanHandler: both ways of putting a word into a
    // lesson's glossary must reach the module glossary the same way.
    await syncModuleGlossary(
      { lessonRepo: this.lessonRepo, contentRelationRepo: this.contentRelationRepo },
      { lesson, vocabularyItemId: command.vocabularyItemId, userId: command.userId },
    );

    return Result.ok({ mark });
  }
}
