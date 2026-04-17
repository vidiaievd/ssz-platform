import { GrammarRuleFilter } from '../../../domain/repositories/grammar-rule.repository.interface.js';

export class GetGrammarRulesQuery {
  constructor(public readonly filter: GrammarRuleFilter) {}
}
