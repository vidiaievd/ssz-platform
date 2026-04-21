export class DeleteContainerCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
