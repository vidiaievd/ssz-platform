export class GetGrammarRuleExplanationsQuery {
  constructor(
    public readonly ruleId: string,
    public readonly onlyPublished: boolean = false,
  ) {}
}
