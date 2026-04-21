export class GetContainerQuery {
  constructor(
    public readonly containerId: string,
    public readonly userId: string,
  ) {}
}
