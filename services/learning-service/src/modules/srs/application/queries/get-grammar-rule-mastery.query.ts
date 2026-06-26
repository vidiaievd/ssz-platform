export class GetGrammarRuleMasteryQuery {
  constructor(
    public readonly userId: string,
    public readonly grammarRuleId: string,
  ) {}
}
