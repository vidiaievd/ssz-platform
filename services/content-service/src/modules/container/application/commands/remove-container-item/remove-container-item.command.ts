export class RemoveContainerItemCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
  ) {}
}
