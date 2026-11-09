export class GetDueGrammarRulesQuery {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
  ) {}
}
