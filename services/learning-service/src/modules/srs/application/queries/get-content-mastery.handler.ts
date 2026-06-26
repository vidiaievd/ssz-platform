import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContentMasteryQuery } from './get-content-mastery.query.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import { GrammarRuleMasteryService, GRAMMAR_RULE_MASTERY_THRESHOLD } from '../services/grammar-rule-mastery.service.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Result } from '../../../../shared/kernel/result.js';

export type ContentMasteryStatus = 'NO_ATOMS' | 'NOT_STARTED' | 'LEARNING' | 'MASTERED';

export interface ContentMasteryDto {
  sourceType: string;
  sourceId: string;
  atomCount: number;
  notStartedCount: number;
  inProgressCount: number;
  masteredCount: number;
  averageRetrievability: number;
  status: ContentMasteryStatus;
}

// Plan 21 §2.1 — "real mastery is aggregated on read over the SrsReviewCards
// reachable through the ContentRelation graph." Walks a unit's INTRODUCES
// (→ VOCABULARY_ITEM) and FEATURES (→ GRAMMAR_RULE) edges; vocabulary atoms
// are scored directly off their own SRS card, grammar atoms are scored via
// GrammarRuleMasteryService (§2.2, no card type of their own).
@QueryHandler(GetContentMasteryQuery)
export class GetContentMasteryHandler
  implements IQueryHandler<GetContentMasteryQuery, Result<ContentMasteryDto, ContentClientError>>
{
  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
    private readonly grammarRuleMastery: GrammarRuleMasteryService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    query: GetContentMasteryQuery,
  ): Promise<Result<ContentMasteryDto, ContentClientError>> {
    const relationsResult = await this.contentClient.getRelationsBySource(
      query.sourceType,
      query.sourceId,
    );
    if (relationsResult.isFail) return Result.fail(relationsResult.error);

    const relations = relationsResult.value.filter(
      (r) => r.relationKind === 'introduces' || r.relationKind === 'features',
    );
    const vocabIds = relations
      .filter((r) => r.targetType === 'vocabulary_item')
      .map((r) => r.targetId);
    const ruleIds = relations
      .filter((r) => r.targetType === 'grammar_rule')
      .map((r) => r.targetId);

    if (vocabIds.length === 0 && ruleIds.length === 0) {
      return Result.ok(this.aggregate(query, []));
    }

    const now = this.clock.now();
    const vocabScores = await this.scoreVocabularyItems(query.userId, vocabIds, now);

    const ruleScores: number[] = [];
    for (const ruleId of ruleIds) {
      const result = await this.grammarRuleMastery.getMastery(query.userId, ruleId, now);
      if (result.isFail) return Result.fail(result.error);
      ruleScores.push(result.value.averageRetrievability);
    }

    return Result.ok(this.aggregate(query, [...vocabScores, ...ruleScores]));
  }

  private async scoreVocabularyItems(
    userId: string,
    vocabIds: string[],
    now: Date,
  ): Promise<number[]> {
    if (vocabIds.length === 0) return [];

    const cards = await this.srsRepo.findByUserAndContents(userId, 'VOCABULARY_WORD', vocabIds);
    const cardByContentId = new Map(cards.map((card) => [card.contentId, card]));

    return vocabIds.map((id) => {
      const card = cardByContentId.get(id);
      return card ? this.scheduler.getRetrievability(card, now) : 0;
    });
  }

  private aggregate(query: GetContentMasteryQuery, scores: number[]): ContentMasteryDto {
    const atomCount = scores.length;
    const notStartedCount = scores.filter((s) => s === 0).length;
    const masteredCount = scores.filter((s) => s >= GRAMMAR_RULE_MASTERY_THRESHOLD).length;
    const inProgressCount = atomCount - notStartedCount - masteredCount;
    const averageRetrievability =
      atomCount === 0 ? 0 : scores.reduce((sum, s) => sum + s, 0) / atomCount;

    const status: ContentMasteryStatus =
      atomCount === 0
        ? 'NO_ATOMS'
        : masteredCount === atomCount
          ? 'MASTERED'
          : notStartedCount === atomCount
            ? 'NOT_STARTED'
            : 'LEARNING';

    return {
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      atomCount,
      notStartedCount,
      inProgressCount,
      masteredCount,
      averageRetrievability,
      status,
    };
  }
}
