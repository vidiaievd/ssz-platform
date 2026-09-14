import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { LEARNING_EVENT_TYPES } from '@ssz/contracts';
import type { SrsLimitRefusedPayload } from '@ssz/contracts';
import { ReviewCard } from '../../domain/entities/review-card.entity.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { SrsNewCardLimitError, type SrsApplicationError } from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { AtomTrackResolverService } from '../services/atom-track-resolver.service.js';
import type { SrsTrack } from '../../domain/value-objects/srs-track.js';
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
    // on words must not be a reason to refuse a rule that came due.
    const track = await this.trackResolver.resolve(cmd.contentType, cmd.contentId);

    // Seeded (skip-known) cards bypass the daily new-card limit — they represent
    // material the learner already knows, not new learning effort.
    // A shadow card is charged to nobody (plan 63 phase 5) — see the command.
    if (!cmd.seedKind && !cmd.shadow) {
      const canIntroduce = await this.limitsPolicy.canIntroduceNewCard(cmd.userId, track, now);
      if (!canIntroduce) {
        await this.recordRefusal(cmd, track, now);
        return Result.fail(new SrsNewCardLimitError());
      }
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
      : ReviewCard.create(cmd.userId, cmd.contentType, cmd.contentId, track, now);
    await this.repo.save(card);
    if (!cmd.seedKind && !cmd.shadow) {
      await this.limitsPolicy.incrementNewCardCount(cmd.userId, track, now);
    }

    this.logger.log(
      `Introduced SRS card for user ${cmd.userId}: ${cmd.contentType}:${cmd.contentId}` +
        (cmd.seedKind ? ` (seeded: ${cmd.seedKind})` : ''),
    );

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }

  /**
   * Leave a trace of the one decision here that produces nothing (plan 37 §A.1).
   *
   * This is the case the calibration data is blind to: the caller has already done
   * the work — the attempt was scored, progress written — and the card that would
   * have carried it into the schedule is never created. Nothing downstream ever
   * hears about it, so if it is not counted here it is not counted anywhere.
   *
   * Fails soft. Telemetry that can turn a refusal into a thrown exception would make
   * the measurement worse than the gap it fills.
   */
  private async recordRefusal(
    cmd: IntroduceCardCommand,
    track: SrsTrack,
    now: Date,
  ): Promise<void> {
    try {
      await this.limitsPolicy.recordRefusal(cmd.userId, 'new', track, now);

      const payload: SrsLimitRefusedPayload = {
        userId: cmd.userId,
        kind: 'new',
        contentType: cmd.contentType,
        track,
        occurredAt: now.toISOString(),
      };
      await this.publisher.publish(LEARNING_EVENT_TYPES.SRS_LIMIT_REFUSED, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to record new-card limit refusal for user ${cmd.userId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
