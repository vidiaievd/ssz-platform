import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetDueGrammarRulesQuery } from './get-due-grammar-rules.query.js';
import {
  GrammarRuleMasteryService,
  type DueGrammarRulesDto,
} from '../services/grammar-rule-mastery.service.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';

@QueryHandler(GetDueGrammarRulesQuery)
export class GetDueGrammarRulesHandler
  implements IQueryHandler<GetDueGrammarRulesQuery, Result<DueGrammarRulesDto, ContentClientError>>
{
  constructor(
    private readonly masteryService: GrammarRuleMasteryService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  execute(query: GetDueGrammarRulesQuery): Promise<Result<DueGrammarRulesDto, ContentClientError>> {
    return this.masteryService.getDueForCourse(query.userId, query.courseId, this.clock.now());
  }
}
