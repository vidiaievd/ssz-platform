import type { GrammarRuleExplanationsQueryDto } from '../../../presentation/dto/requests/grammar-rule-explanations-query.dto.js';

export class GetGrammarRuleExplanationsQuery {
  constructor(
    public readonly ruleId: string,
    public readonly dto: GrammarRuleExplanationsQueryDto,
  ) {}
}
