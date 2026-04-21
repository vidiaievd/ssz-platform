export class UpdateUsageExampleCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly exampleId: string,
    public readonly exampleText?: string,
    public readonly audioMediaId?: string | null,
    public readonly contextNote?: string | null,
  ) {}
}
