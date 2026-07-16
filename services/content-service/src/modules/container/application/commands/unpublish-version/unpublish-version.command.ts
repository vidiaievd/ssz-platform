export class UnpublishVersionCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
