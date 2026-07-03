import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { toReviewCardDto, type DueCardsEnvelope } from '../dto/srs.dto.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { GetDueCardsQuery } from './get-due-cards.query.js';

@QueryHandler(GetDueCardsQuery)
export class GetDueCardsHandler implements IQueryHandler<GetDueCardsQuery, DueCardsEnvelope> {
  private readonly logger = new Logger(GetDueCardsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
    @Inject(SRS_LIMITS_POLICY) private readonly limitsPolicy: ISrsLimitsPolicy,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(query: GetDueCardsQuery): Promise<DueCardsEnvelope> {
    const now = this.clock.now();

    // Fetch cards and metadata in parallel.
    const [cardDtos, reviewedToday, streakDays] = await Promise.all([
      this.fetchCards(query, now),
      this.limitsPolicy.getReviewedCount(query.userId, now),
      this.repo.getStreakDays(query.userId, now),
    ]);

    return {
      cards: cardDtos,
      reviewedToday,
      dailyLimit: this.limitsPolicy.getDailyReviewLimit(),
      streakDays,
    };
  }

  private async fetchCards(query: GetDueCardsQuery, now: Date) {
    // Try Redis cache first.
    const cachedIds = await this.dueQueue.getDueCardIds(query.userId, now, query.limit);

    if (cachedIds !== null) {
      const cards = await Promise.all(cachedIds.map((id) => this.repo.findById(id)));
      const present = cards.filter((c): c is NonNullable<typeof c> => c !== null);
      return present.map((c) => toReviewCardDto(c, this.scheduler.predictIntervals(c, now)));
    }

    // Cache miss: query DB and populate the cache lazily.
    const cards = await this.repo.findDueCards(query.userId, query.limit, now);

    if (cards.length > 0) {
      await this.dueQueue.populate(
        query.userId,
        cards.map((c) => ({ id: c.id, dueAt: c.dueAt })),
      );
    }

    return cards.map((c) => toReviewCardDto(c, this.scheduler.predictIntervals(c, now)));
  }
}
