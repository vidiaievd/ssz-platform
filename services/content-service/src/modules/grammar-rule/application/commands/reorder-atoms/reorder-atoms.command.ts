export class ReorderAtomsCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly items: Array<{ atomId: string; position: number }>,
  ) {}
}
