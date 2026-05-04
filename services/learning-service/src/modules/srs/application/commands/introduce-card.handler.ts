import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ReviewCard } from '../../domain/entities/review-card.entity.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { SrsNewCardLimitError, type SrsApplicationError } from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { IntroduceCardCommand } from './introduce-card.command.js';

@CommandHandler(IntroduceCardCommand)
export class IntroduceCardHandler
  implements ICommandHandler<IntroduceCardCommand, Result<ReviewCardDto, SrsApplicationError>>
{
  private readonly logger = new Logger(IntroduceCardHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(SRS_LIMITS_POLICY) private readonly limitsPolicy: ISrsLimitsPolicy,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: IntroduceCardCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const now = this.clock.now();

    // Idempotency: return existing card without consuming the daily limit.
    const existing = await this.repo.findByUserAndContent(cmd.userId, cmd.contentType, cmd.contentId);
    if (existing) {
      return Result.ok(toReviewCardDto(existing));
    }

    const canIntroduce = await this.limitsPolicy.canIntroduceNewCard(cmd.userId, now);
    if (!canIntroduce) {
      return Result.fail(new SrsNewCardLimitError());
    }

    const card = ReviewCard.create(cmd.userId, cmd.contentType, cmd.contentId, now);
    await this.repo.save(card);
    await this.limitsPolicy.incrementNewCardCount(cmd.userId, now);

    this.logger.log(`Introduced SRS card for user ${cmd.userId}: ${cmd.contentType}:${cmd.contentId}`);

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }
}
