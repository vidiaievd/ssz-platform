export class DeleteAtomCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly atomId: string,
  ) {}
}
