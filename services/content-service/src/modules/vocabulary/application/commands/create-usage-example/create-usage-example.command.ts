export class CreateUsageExampleCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly exampleText: string,
    public readonly audioMediaId?: string,
    public readonly contextNote?: string,
    public readonly position?: number,
  ) {}
}
