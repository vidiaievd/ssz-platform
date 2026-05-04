import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ReviewRating } from '../../domain/value-objects/review-rating.vo.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
  SrsCardSuspendedError,
  SrsReviewLimitError,
  type SrsApplicationError,
} from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { ReviewCardCommand } from './review-card.command.js';

@CommandHandler(ReviewCardCommand)
export class ReviewCardHandler
  implements ICommandHandler<ReviewCardCommand, Result<ReviewCardDto, SrsApplicationError>>
{
  private readonly logger = new Logger(ReviewCardHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
    @Inject(SRS_LIMITS_POLICY) private readonly limitsPolicy: ISrsLimitsPolicy,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(cmd: ReviewCardCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const card = await this.repo.findById(cmd.cardId);
    if (!card) {
      return Result.fail(new SrsCardNotFoundError(cmd.cardId));
    }
    if (card.userId !== cmd.userId) {
      return Result.fail(new SrsCardUnauthorizedError());
    }

    const reviewedAt = cmd.reviewedAt ?? this.clock.now();
    const canReview = await this.limitsPolicy.canReview(cmd.userId, reviewedAt);
    if (!canReview) {
      return Result.fail(new SrsReviewLimitError());
    }

    const rating = ReviewRating.fromString(cmd.rating);
    const schedulingResult = this.scheduler.schedule(card, rating, reviewedAt);

    const reviewResult = card.review(rating, schedulingResult, reviewedAt);
    if (reviewResult.isFail) {
      return Result.fail(new SrsCardSuspendedError());
    }

    await this.repo.save(card);
    await this.limitsPolicy.incrementReviewCount(cmd.userId, reviewedAt);
    await this.dueQueue.upsert(cmd.userId, card.id, card.dueAt);

    this.logger.log(
      `Card ${card.id} reviewed by ${cmd.userId} — rating: ${cmd.rating}, next due: ${card.dueAt.toISOString()}`,
    );

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }
}
