export class GetGrammarRuleExplanationQuery {
  constructor(
    public readonly ruleId: string,
    public readonly explanationId: string,
  ) {}
}
