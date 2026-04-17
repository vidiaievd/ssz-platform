export class DeleteGrammarRuleCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
  ) {}
}
