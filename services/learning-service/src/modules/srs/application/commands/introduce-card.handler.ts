import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ReviewCard } from '../../domain/entities/review-card.entity.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import type { SrsApplicationError } from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { AtomTrackResolverService } from '../services/atom-track-resolver.service.js';
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
    private readonly trackResolver: AtomTrackResolverService,
  ) {}

  async execute(cmd: IntroduceCardCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const now = this.clock.now();

    // Idempotency: return existing card without consuming the daily limit.
    const existing = await this.repo.findByUserAndContent(cmd.userId, cmd.contentType, cmd.contentId);
    if (existing) {
      return Result.ok(toReviewCardDto(existing));
    }

    // Which of the two budgets this card belongs to (plan 63 phase 6). Resolved before
    // the cap is consulted, because the cap is now a fact about the track: a day spent
    // on words must not be a reason to push back a rule.
    const track = await this.trackResolver.resolve(cmd.contentType, cmd.contentId);

    // Seeded (skip-known) cards bypass the daily new-card budget — they represent
    // material the learner already knows, not new learning effort.
    // A shadow card is charged to nobody (plan 63 phase 5) — see the command.
    //
    // Everything else is charged, but never refused (plan 37 §C.1). By the time a card
    // is introduced the work is done — the attempt scored, progress written — so a
    // refusal prevents nothing and only drops the material from the schedule, in a
    // linear course for good. The budget regulates when the card first comes back
    // instead: today while today has room, the first day that does after that.
    const charged = !cmd.seedKind && !cmd.shadow;
    let dueAt = now;
    if (charged) {
      const day = await this.limitsPolicy.claimNewCardDay(cmd.userId, track, now);
      if (day.getTime() > now.getTime()) dueAt = day;
    }

    const card = cmd.seedKind
      ? ReviewCard.createSeeded(
          cmd.userId,
          cmd.contentType,
          cmd.contentId,
          track,
          cmd.seedKind,
          now,
        )
      : ReviewCard.create(cmd.userId, cmd.contentType, cmd.contentId, track, now, dueAt);
    await this.repo.save(card);

    this.logger.log(
      `Introduced SRS card for user ${cmd.userId}: ${cmd.contentType}:${cmd.contentId}` +
        (cmd.seedKind ? ` (seeded: ${cmd.seedKind})` : '') +
        (dueAt !== now ? ` (budget spent, first due ${dueAt.toISOString()})` : ''),
    );

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }
}
