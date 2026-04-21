import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PublishVariantCommand } from './publish-variant.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { LessonVariantPublishedEvent } from '../../../domain/events/lesson-variant-published.event.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

@CommandHandler(PublishVariantCommand)
export class PublishVariantHandler implements ICommandHandler<
  PublishVariantCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: PublishVariantCommand): Promise<Result<void, LessonDomainError>> {
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

    if (lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_ALREADY_DELETED);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const publishResult = variant.publish();
    if (publishResult.isFail) {
      return Result.fail(publishResult.error);
    }

    await this.variantRepo.save(variant);

    // Determine whether this is the first published variant for the lesson.
    const isFirstPublished = !(await this.lessonRepo.hasAnyPublishedVariant(lesson.id));

    // Assign a slug to the lesson if this is the first published variant
    // and the lesson has PUBLIC visibility (slug is used for public URL routing).
    if (isFirstPublished && lesson.slug === null) {
      const baseSlug = generateSlug(lesson.title);
      const uniqueSlug = await resolveUniqueSlug(baseSlug, (candidate) =>
        this.lessonRepo.isSlugTaken(candidate),
      );
      lesson.assignSlugIfNeeded(uniqueSlug);
      await this.lessonRepo.save(lesson);
    }

    // Variant is not an AggregateRoot — publish event directly via IEventPublisher.
    await this.eventPublisher.publish(
      'content.lesson.variant.published',
      new LessonVariantPublishedEvent({
        lessonId: lesson.id,
        variantId: variant.id,
        explanationLanguage: variant.explanationLanguage,
        isFirstPublishedVariant: isFirstPublished,
      }),
    );

    return Result.ok();
  }
}
