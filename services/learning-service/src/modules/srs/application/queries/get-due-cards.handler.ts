import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { GetDueCardsQuery } from './get-due-cards.query.js';

@QueryHandler(GetDueCardsQuery)
export class GetDueCardsHandler implements IQueryHandler<GetDueCardsQuery, ReviewCardDto[]> {
  private readonly logger = new Logger(GetDueCardsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(query: GetDueCardsQuery): Promise<ReviewCardDto[]> {
    const now = this.clock.now();

    // Try Redis cache first.
    const cachedIds = await this.dueQueue.getDueCardIds(query.userId, now, query.limit);

    if (cachedIds !== null) {
      // Cache hit: load cards by ID from DB.
      const cards = await Promise.all(
        cachedIds.map((id) => this.repo.findById(id)),
      );
      return cards
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map(toReviewCardDto);
    }

    // Cache miss: query DB and populate the cache lazily.
    const cards = await this.repo.findDueCards(query.userId, query.limit, now);

    // Populate Redis with ALL due cards (not just the current page).
    if (cards.length > 0) {
      await this.dueQueue.populate(
        query.userId,
        cards.map((c) => ({ id: c.id, dueAt: c.dueAt })),
      );
    }

    return cards.map(toReviewCardDto);
  }
}
