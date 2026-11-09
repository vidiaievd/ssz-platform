import { Inject, Injectable } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import type { ReviewCard } from '../../domain/entities/review-card.entity.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  grammarDueReasons,
  orderReviewPool,
  summarisePool,
  type GrammarDueReason,
  type GrammarPoolSummary,
} from './grammar-rule-review.policy.js';

// Plan 21 §2.2 — there is no GRAMMAR_RULE SRS card type; mastery is derived
// on read from the retrievability of the rule's exercise-pool cards.
export const GRAMMAR_RULE_MASTERY_THRESHOLD = 0.8;

export type GrammarRuleMasteryStatus = 'NOT_STARTED' | 'LEARNING' | 'MASTERED';

export interface GrammarRuleMasteryDto {
  grammarRuleId: string;
  poolSize: number;
  introducedCount: number;
  averageRetrievability: number;
  masteredCount: number;
  status: GrammarRuleMasteryStatus;
}

/** What the practice tab knows about one rule (plan 05 step 7). */
export interface GrammarRuleReviewStateDto {
  grammarRuleId: string;
  poolSize: number;
  introducedCount: number;
  averageRetrievability: number;
  lastPracticedAt: string | null;
  strugglingCount: number;
  dueReasons: GrammarDueReason[];
}

export interface DueGrammarRuleDto extends GrammarRuleReviewStateDto {
  /** The unit (top-level module) the rule sits in; null when directly under the course. */
  moduleId: string | null;
}

export interface DueGrammarRulesDto {
  courseId: string;
  /** Lowest mastery first. */
  rules: DueGrammarRuleDto[];
}

export interface GrammarRuleReviewDto extends GrammarRuleReviewStateDto {
  /** Exercise ids to run, at most eight: lapsed first, then the longest unpractised. */
  reviewPool: string[];
}

@Injectable()
export class GrammarRuleMasteryService {
  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
  ) {}

  async getMastery(
    userId: string,
    grammarRuleId: string,
    now: Date,
  ): Promise<Result<GrammarRuleMasteryDto, ContentClientError>> {
    const poolResult = await this.contentClient.getGrammarRulePoolExerciseIds(grammarRuleId);
    if (poolResult.isFail) return Result.fail(poolResult.error);

    const exerciseIds = poolResult.value;
    if (exerciseIds.length === 0) {
      return Result.ok(this.emptyResult(grammarRuleId));
    }

    const cards = await this.srsRepo.findByUserAndContents(userId, 'EXERCISE', exerciseIds);
    const retrievabilityOf = (card: ReviewCard) => this.scheduler.getRetrievability(card, now);
    const { introducedCount, averageRetrievability } = summarisePool(exerciseIds, cards, retrievabilityOf);
    const masteredCount = cards.filter((card) => retrievabilityOf(card) >= GRAMMAR_RULE_MASTERY_THRESHOLD).length;

    const status: GrammarRuleMasteryStatus =
      introducedCount === 0
        ? 'NOT_STARTED'
        : averageRetrievability >= GRAMMAR_RULE_MASTERY_THRESHOLD
          ? 'MASTERED'
          : 'LEARNING';

    return Result.ok({
      grammarRuleId,
      poolSize: exerciseIds.length,
      introducedCount,
      averageRetrievability,
      masteredCount,
      status,
    });
  }

  /** One rule's state and the exercises its review runs. */
  async getReview(
    userId: string,
    grammarRuleId: string,
    now: Date,
  ): Promise<Result<GrammarRuleReviewDto, ContentClientError>> {
    const poolResult = await this.contentClient.getGrammarRulePoolExerciseIds(grammarRuleId);
    if (poolResult.isFail) return Result.fail(poolResult.error);

    const exerciseIds = poolResult.value;
    const cards =
      exerciseIds.length === 0
        ? []
        : await this.srsRepo.findByUserAndContents(userId, 'EXERCISE', exerciseIds);
    const summary = summarisePool(exerciseIds, cards, (card) => this.scheduler.getRetrievability(card, now));

    return Result.ok({
      ...this.toState(grammarRuleId, summary, now),
      reviewPool: orderReviewPool(exerciseIds, cards),
    });
  }

  /**
   * The course's rules that are due for review. One pool request per rule (pools are
   * read in parallel) and one card query for all of them.
   */
  async getDueForCourse(
    userId: string,
    courseId: string,
    now: Date,
  ): Promise<Result<DueGrammarRulesDto, ContentClientError>> {
    const leafResult = await this.contentClient.getCourseLeafItems(courseId);
    if (leafResult.isFail) return Result.fail(leafResult.error);

    const rules = leafResult.value.filter((leaf) => leaf.ref.type === 'GRAMMAR_RULE');
    const pools = await Promise.all(
      rules.map((rule) => this.contentClient.getGrammarRulePoolExerciseIds(rule.ref.id)),
    );
    const failed = pools.find((pool) => pool.isFail);
    if (failed) return Result.fail(failed.error);

    const exerciseIds = [...new Set(pools.flatMap((pool) => pool.value))];
    const cards =
      exerciseIds.length === 0
        ? []
        : await this.srsRepo.findByUserAndContents(userId, 'EXERCISE', exerciseIds);
    const retrievabilityOf = (card: ReviewCard) => this.scheduler.getRetrievability(card, now);

    const due: DueGrammarRuleDto[] = [];
    rules.forEach((rule, index) => {
      const pool = pools[index].value;
      const state = this.toState(rule.ref.id, summarisePool(pool, cards, retrievabilityOf), now);
      if (state.dueReasons.length > 0) due.push({ ...state, moduleId: rule.moduleId });
    });
    due.sort((a, b) => a.averageRetrievability - b.averageRetrievability);

    return Result.ok({ courseId, rules: due });
  }

  private toState(
    grammarRuleId: string,
    summary: GrammarPoolSummary,
    now: Date,
  ): GrammarRuleReviewStateDto {
    return {
      grammarRuleId,
      poolSize: summary.poolSize,
      introducedCount: summary.introducedCount,
      averageRetrievability: summary.averageRetrievability,
      lastPracticedAt: summary.lastPracticedAt?.toISOString() ?? null,
      strugglingCount: summary.strugglingCount,
      dueReasons: grammarDueReasons(summary, now),
    };
  }

  private emptyResult(grammarRuleId: string): GrammarRuleMasteryDto {
    return {
      grammarRuleId,
      poolSize: 0,
      introducedCount: 0,
      averageRetrievability: 0,
      masteredCount: 0,
      status: 'NOT_STARTED',
    };
  }
}
