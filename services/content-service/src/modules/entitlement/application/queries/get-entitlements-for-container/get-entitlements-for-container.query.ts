export class GetEntitlementsForContainerQuery {
  constructor(
    public readonly containerId: string,
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
