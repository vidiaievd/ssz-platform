export class DeleteExplanationCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly explanationId: string,
  ) {}
}
