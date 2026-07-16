export class RestoreContainerCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
