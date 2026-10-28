export class GetGrammarRuleReviewQuery {
  constructor(
    public readonly userId: string,
    public readonly grammarRuleId: string,
  ) {}
}
