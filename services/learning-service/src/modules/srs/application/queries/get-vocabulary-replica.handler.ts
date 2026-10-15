import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  SRS_REPOSITORY,
  type ISrsRepository,
} from '../../domain/repositories/srs-repository.interface.js';
import { SRS_LIMITS_POLICY, type ISrsLimitsPolicy } from '../ports/srs-limits-policy.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { toReplicaCardDto, type VocabularyReplicaEnvelope } from '../dto/srs.dto.js';
import { GetVocabularyReplicaQuery } from './get-vocabulary-replica.query.js';

/**
 * The server stays the owner of the schedule: the client recomputes due dates offline only
 * as a preview, its reviews come back through the ordinary review route with their original
 * `reviewedAt`, and the next replica replaces whatever it computed.
 *
 * No word content and no predicted intervals: the client draws words from the lists it has
 * imported and predicts with its own copy of the scheduler. That keeps this one query and
 * one round trip for a learner's whole vocabulary.
 */
@QueryHandler(GetVocabularyReplicaQuery)
export class GetVocabularyReplicaHandler implements IQueryHandler<
  GetVocabularyReplicaQuery,
  VocabularyReplicaEnvelope
> {
  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(SRS_LIMITS_POLICY) private readonly limitsPolicy: ISrsLimitsPolicy,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(query: GetVocabularyReplicaQuery): Promise<VocabularyReplicaEnvelope> {
    const now = this.clock.now();
    const [cards, reviewedToday] = await Promise.all([
      this.repo.findByUserAndType(query.userId, 'VOCABULARY_WORD'),
      this.limitsPolicy.getReviewedCount(query.userId, now, 'lexis'),
    ]);

    return {
      serverTime: now.toISOString(),
      reviewedToday,
      dailyLimit: this.limitsPolicy.getDailyReviewLimit('lexis'),
      cards: cards.map(toReplicaCardDto),
    };
  }
}
