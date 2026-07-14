import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetTextParagraphsQuery } from './get-text-paragraphs.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { MarkdownParagraphSplitterService } from '../../../domain/services/markdown-paragraph-splitter.service.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_PARAGRAPH_TRANSLATION_REPOSITORY } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import type { ILessonParagraphTranslationRepository } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';

export interface TextParagraphResult {
  target: string;
  translation: string | null;
}

@QueryHandler(GetTextParagraphsQuery)
export class GetTextParagraphsHandler implements IQueryHandler<
  GetTextParagraphsQuery,
  Result<TextParagraphResult[], LessonDomainError>
> {
  constructor(
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_PARAGRAPH_TRANSLATION_REPOSITORY)
    private readonly translationRepo: ILessonParagraphTranslationRepository,
  ) {}

  async execute(
    query: GetTextParagraphsQuery,
  ): Promise<Result<TextParagraphResult[], LessonDomainError>> {
    const variant = await this.variantRepo.findById(query.variantId);
    if (!variant || variant.deletedAt !== null) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const paragraphs = MarkdownParagraphSplitterService.split(variant.bodyMarkdown);
    const translations = await this.translationRepo.findByVariantId(query.variantId);
    const translationByIndex = new Map(translations.map((t) => [t.paragraphIndex, t.translation]));

    const result = paragraphs.map((target, index) => ({
      target,
      translation: translationByIndex.get(index) ?? null,
    }));

    return Result.ok(result);
  }
}
