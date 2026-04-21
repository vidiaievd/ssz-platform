export class RemovePoolEntryCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly exerciseId: string,
  ) {}
}
