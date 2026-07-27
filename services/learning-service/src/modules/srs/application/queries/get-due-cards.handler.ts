import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  toReviewCardDto,
  toVocabularyCardContent,
  type DueCardsEnvelope,
  type ReviewCardDto,
} from '../dto/srs.dto.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
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
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
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
      cards: await this.enrichVocabularyCards(cardDtos, query),
      reviewedToday,
      dailyLimit: this.limitsPolicy.getDailyReviewLimit(),
      streakDays,
    };
  }

  /**
   * Resolves the word text for VOCABULARY_WORD cards in one batch call. A card
   * holds only a vocabulary item id, and clients cannot resolve it themselves
   * (the public item route is nested under a list id they don't have), so the
   * queue would be unrenderable without this. Best-effort: a Content Service
   * failure leaves front/back null rather than failing the whole due queue.
   */
  private async enrichVocabularyCards(
    cards: ReviewCardDto[],
    query: GetDueCardsQuery,
  ): Promise<ReviewCardDto[]> {
    const itemIds = cards
      .filter((c) => c.contentType === 'VOCABULARY_WORD')
      .map((c) => c.contentId);

    if (itemIds.length === 0) return cards;

    const result = await this.contentClient.getVocabularyItemsForDisplay(
      [...new Set(itemIds)],
      query.language,
      { includeExamples: query.includeExamples },
    );

    if (result.isFail) {
      this.logger.warn(
        `Due queue: vocabulary content lookup failed (${itemIds.length} items): ${result.error.message}`,
      );
      return cards;
    }

    const byItemId = new Map(result.value.map((item) => [item.itemId, item]));

    return cards.map((card) => {
      const item = card.contentType === 'VOCABULARY_WORD' ? byItemId.get(card.contentId) : undefined;
      if (!item) return card;
      return { ...card, ...toVocabularyCardContent(item) };
    });
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
