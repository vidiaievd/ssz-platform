export class DeleteUsageExampleCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly exampleId: string,
  ) {}
}
