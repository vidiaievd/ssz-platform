import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleMasteryQuery } from './get-grammar-rule-mastery.query.js';
import {
  GrammarRuleMasteryService,
  type GrammarRuleMasteryDto,
} from '../services/grammar-rule-mastery.service.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';

@QueryHandler(GetGrammarRuleMasteryQuery)
export class GetGrammarRuleMasteryHandler
  implements IQueryHandler<GetGrammarRuleMasteryQuery, Result<GrammarRuleMasteryDto, ContentClientError>>
{
  constructor(
    private readonly masteryService: GrammarRuleMasteryService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  execute(
    query: GetGrammarRuleMasteryQuery,
  ): Promise<Result<GrammarRuleMasteryDto, ContentClientError>> {
    return this.masteryService.getMastery(query.userId, query.grammarRuleId, this.clock.now());
  }
}
