import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetTextSpansQuery } from './get-text-spans.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import { MarkdownParagraphSplitterService } from '../../../domain/services/markdown-paragraph-splitter.service.js';
import {
  TextSpanAnchorService,
  type SpanAnchorCandidate,
} from '../../../domain/services/text-span-anchor.service.js';
import type {
  LessonTextSpanEntity,
  SpanBrokenReason,
} from '../../../domain/entities/lesson-text-span.entity.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_TEXT_SPAN_REPOSITORY } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import type { ILessonTextSpanRepository } from '../../../domain/repositories/lesson-text-span.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../../grammar-rule/domain/repositories/grammar-rule.repository.interface.js';

export interface TextSpanView {
  span: LessonTextSpanEntity;
  brokenReason: SpanBrokenReason | null;
  /** Where the span's snapshot text now sits; empty unless the span is broken. */
  reanchorCandidates: SpanAnchorCandidate[];
}

/**
 * Reads a variant's annotations and decides, against the body as it stands right
 * now, which of them still hold.
 *
 * Brokenness is computed here rather than stored: a persisted flag would have to
 * be invalidated on every body edit, every referent delete and every restore —
 * three write paths, each with a chance to leave it stale — to save a string
 * comparison per span over an already-loaded body.
 */
@QueryHandler(GetTextSpansQuery)
export class GetTextSpansHandler implements IQueryHandler<
  GetTextSpansQuery,
  Result<TextSpanView[], LessonDomainError>
> {
  constructor(
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_TEXT_SPAN_REPOSITORY)
    private readonly spanRepo: ILessonTextSpanRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly vocabularyItemRepo: IVocabularyItemRepository,
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly grammarRuleRepo: IGrammarRuleRepository,
  ) {}

  async execute(query: GetTextSpansQuery): Promise<Result<TextSpanView[], LessonDomainError>> {
    const variant = await this.variantRepo.findById(query.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const spans = await this.spanRepo.findByVariantId(query.variantId);
    if (spans.length === 0) {
      return Result.ok([]);
    }

    const paragraphs = MarkdownParagraphSplitterService.split(variant.bodyMarkdown);
    const liveRefIds = await this.resolveLiveRefs(spans);

    const views: TextSpanView[] = [];
    for (const span of spans) {
      const brokenReason =
        span.brokenReasonAgainst(paragraphs) ??
        (span.refId && !liveRefIds.has(span.refId) ? ('ref' as const) : null);

      if (brokenReason && !query.includeBroken) continue;

      views.push({
        span,
        brokenReason,
        reanchorCandidates:
          brokenReason === 'offset'
            ? TextSpanAnchorService.findCandidates(paragraphs, span.textSnapshot)
            : [],
      });
    }

    return Result.ok(views);
  }

  /** Ids of the referents that still exist and are not soft-deleted. */
  private async resolveLiveRefs(spans: LessonTextSpanEntity[]): Promise<Set<string>> {
    const byKind = new Map<LessonSpanKind, Set<string>>();
    for (const span of spans) {
      if (!span.refId) continue;
      const bucket = byKind.get(span.kind) ?? new Set<string>();
      bucket.add(span.refId);
      byKind.set(span.kind, bucket);
    }

    const live = new Set<string>();

    for (const id of byKind.get(LessonSpanKind.VOCAB) ?? []) {
      const item = await this.vocabularyItemRepo.findById(id);
      if (item && item.deletedAt === null) live.add(id);
    }

    for (const id of byKind.get(LessonSpanKind.GRAMMAR) ?? []) {
      const rule = await this.grammarRuleRepo.findById(id);
      if (rule && rule.deletedAt === null) live.add(id);
    }

    return live;
  }
}
