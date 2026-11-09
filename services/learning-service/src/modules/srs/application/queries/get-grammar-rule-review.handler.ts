import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleReviewQuery } from './get-grammar-rule-review.query.js';
import {
  GrammarRuleMasteryService,
  type GrammarRuleReviewDto,
} from '../services/grammar-rule-mastery.service.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';

@QueryHandler(GetGrammarRuleReviewQuery)
export class GetGrammarRuleReviewHandler
  implements IQueryHandler<GetGrammarRuleReviewQuery, Result<GrammarRuleReviewDto, ContentClientError>>
{
  constructor(
    private readonly masteryService: GrammarRuleMasteryService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  execute(query: GetGrammarRuleReviewQuery): Promise<Result<GrammarRuleReviewDto, ContentClientError>> {
    return this.masteryService.getReview(query.userId, query.grammarRuleId, this.clock.now());
  }
}
