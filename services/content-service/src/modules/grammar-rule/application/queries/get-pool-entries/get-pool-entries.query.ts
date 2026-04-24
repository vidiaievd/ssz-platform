import type { GrammarRulePoolQueryDto } from '../../../presentation/dto/requests/grammar-rule-pool-query.dto.js';

export class GetPoolEntriesQuery {
  constructor(
    public readonly ruleId: string,
    public readonly dto: GrammarRulePoolQueryDto,
  ) {}
}
