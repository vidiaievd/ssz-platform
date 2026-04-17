export class AddPoolEntryCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly exerciseId: string,
    public readonly weight?: number,
  ) {}
}
