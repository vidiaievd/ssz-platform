import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateVariantCommand } from './create-variant.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VARIANT_MEDIA_REF_REPOSITORY } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import type { ILessonVariantMediaRefRepository } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { MarkdownMediaParserService } from '../../../domain/services/markdown-media-parser.service.js';
import { LessonVariantCreatedEvent } from '../../../domain/events/lesson-variant-created.event.js';

export interface CreateVariantResult {
  variantId: string;
}

@CommandHandler(CreateVariantCommand)
export class CreateVariantHandler implements ICommandHandler<
  CreateVariantCommand,
  Result<CreateVariantResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VARIANT_MEDIA_REF_REPOSITORY)
    private readonly mediaRefRepo: ILessonVariantMediaRefRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(
    command: CreateVariantCommand,
  ): Promise<Result<CreateVariantResult, LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(command.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_ALREADY_DELETED);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Enforce composite uniqueness in the application layer (DB constraint is the final guard).
    const existing = await this.variantRepo.findByCompositeKey(
      command.lessonId,
      command.explanationLanguage,
      command.minLevel,
      command.maxLevel,
    );
    if (existing) {
      return Result.fail(LessonDomainError.DUPLICATE_VARIANT);
    }

    const variantResult = LessonContentVariantEntity.create({
      lessonId: command.lessonId,
      explanationLanguage: command.explanationLanguage,
      minLevel: command.minLevel,
      maxLevel: command.maxLevel,
      displayTitle: command.displayTitle,
      displayDescription: command.displayDescription,
      bodyMarkdown: command.bodyMarkdown,
      estimatedReadingMinutes: command.estimatedReadingMinutes,
      createdByUserId: command.userId,
    });

    if (variantResult.isFail) {
      return Result.fail(variantResult.error);
    }

    const variant = variantResult.value;
    await this.variantRepo.save(variant);

    // Parse and persist media references extracted from body_markdown.
    const refs = MarkdownMediaParserService.parse(command.bodyMarkdown);
    await this.mediaRefRepo.replaceForVariant(variant.id, refs);

    // Variant is not an AggregateRoot — publish event directly via IEventPublisher.
    await this.eventPublisher.publish(
      'content.lesson.variant.created',
      new LessonVariantCreatedEvent({
        lessonId: command.lessonId,
        variantId: variant.id,
        explanationLanguage: command.explanationLanguage,
        minLevel: command.minLevel,
        maxLevel: command.maxLevel,
      }),
    );

    return Result.ok({ variantId: variant.id });
  }
}
