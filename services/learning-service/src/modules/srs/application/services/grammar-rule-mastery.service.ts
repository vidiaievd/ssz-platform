import { Inject, Injectable } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../shared/kernel/result.js';

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
    const retrievabilities = cards.map((card) => this.scheduler.getRetrievability(card, now));
    const introducedCount = cards.length;
    const averageRetrievability =
      introducedCount === 0
        ? 0
        : retrievabilities.reduce((sum, r) => sum + r, 0) / introducedCount;
    const masteredCount = retrievabilities.filter((r) => r >= GRAMMAR_RULE_MASTERY_THRESHOLD).length;

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
