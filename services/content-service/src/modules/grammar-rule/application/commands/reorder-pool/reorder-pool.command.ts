export class ReorderPoolCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly items: Array<{ exerciseId: string; position: number }>,
  ) {}
}
