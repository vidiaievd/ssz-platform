import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateTextSpanCommand } from './create-text-span.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_TEXT_SPAN_REPOSITORY } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';
import { CONTENT_RELATION_REPOSITORY } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';
import type { IContentRelationRepository } from '../../../../content-relation/domain/repositories/content-relation.repository.interface.js';
import { loadEditableTextVariant } from '../../services/load-editable-text-variant.service.js';
import { syncModuleGlossary } from '../../services/module-glossary-sync.service.js';

export interface CreateTextSpanResult {
  span: LessonTextSpanEntity;
}

@CommandHandler(CreateTextSpanCommand)
export class CreateTextSpanHandler implements ICommandHandler<
  CreateTextSpanCommand,
  Result<CreateTextSpanResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_TEXT_SPAN_REPOSITORY)
    private readonly spanRepo: ILessonTextSpanRepository,
    @Inject(LESSON_GLOSSARY_MARK_REPOSITORY)
    private readonly markRepo: ILessonGlossaryMarkRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly vocabularyItemRepo: IVocabularyItemRepository,
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly grammarRuleRepo: IGrammarRuleRepository,
    @Inject(CONTENT_RELATION_REPOSITORY)
    private readonly contentRelationRepo: IContentRelationRepository,
  ) {}

  async execute(
    command: CreateTextSpanCommand,
  ): Promise<Result<CreateTextSpanResult, LessonDomainError>> {
    const context = await loadEditableTextVariant(
      { lessonRepo: this.lessonRepo, variantRepo: this.variantRepo },
      { variantId: command.variantId },
    );
    if (context.isFail) return Result.fail(context.error);
    const { lesson, paragraphs } = context.value;

    const paragraph = paragraphs[command.paragraphIndex];
    if (paragraph === undefined) {
      return Result.fail(LessonDomainError.INVALID_PARAGRAPH_INDEX);
    }
    if (command.charEnd > paragraph.length) {
      return Result.fail(LessonDomainError.SPAN_RANGE_INVALID);
    }

    // The snapshot is derived here, never accepted from the client: a caller
    // whose offsets were computed against an older body then fails on the range
    // check above or produces a snapshot that visibly is not what it selected,
    // instead of storing a self-consistent lie the reader would render.
    const textSnapshot = paragraph.slice(command.charStart, command.charEnd);

    const refError = await this.checkRef(command.kind, command.refId);
    if (refError) return Result.fail(refError);

    const spanResult = LessonTextSpanEntity.create({
      lessonContentVariantId: command.variantId,
      paragraphIndex: command.paragraphIndex,
      charStart: command.charStart,
      charEnd: command.charEnd,
      kind: command.kind,
      refId: command.refId,
      textSnapshot,
      note: command.note,
      createdByUserId: command.userId,
    });
    if (spanResult.isFail) return Result.fail(spanResult.error);
    const span = spanResult.value;

    // Same-kind spans must not overlap — that would mean two annotations of the
    // same nature competing for one stretch of text. Different kinds may nest
    // freely (a vocab word inside a marked chunk is the point of chunks).
    const existing = await this.spanRepo.findByVariantId(command.variantId);
    const clashes = existing.some((other) => other.kind === span.kind && other.overlaps(span));
    if (clashes) return Result.fail(LessonDomainError.SPAN_OVERLAP);

    const saved = await this.spanRepo.save(span);

    if (span.kind === LessonSpanKind.VOCAB && span.refId) {
      // A word annotated in the text is by definition part of the lesson's
      // glossary; keeping the mark in step here is what stops the two models
      // from drifting apart (spec 16 §5.2).
      await this.markRepo.upsertMark(command.variantId, span.refId);
      await syncModuleGlossary(
        { lessonRepo: this.lessonRepo, contentRelationRepo: this.contentRelationRepo },
        { lesson, vocabularyItemId: span.refId, userId: command.userId },
      );
    }

    return Result.ok({ span: saved });
  }

  private async checkRef(
    kind: LessonSpanKind,
    refId: string | null,
  ): Promise<LessonDomainError | null> {
    if (kind === LessonSpanKind.VOCAB) {
      if (!refId) return LessonDomainError.SPAN_REF_KIND_MISMATCH;
      const item = await this.vocabularyItemRepo.findById(refId);
      if (!item || item.deletedAt !== null) return LessonDomainError.VOCABULARY_ITEM_NOT_FOUND;
      return null;
    }

    if (kind === LessonSpanKind.GRAMMAR) {
      if (!refId) return LessonDomainError.SPAN_REF_KIND_MISMATCH;
      const rule = await this.grammarRuleRepo.findById(refId);
      if (!rule || rule.deletedAt !== null) return LessonDomainError.GRAMMAR_RULE_NOT_FOUND;
      return null;
    }

    return refId ? LessonDomainError.SPAN_REF_KIND_MISMATCH : null;
  }
}
