export class RevokeContentShareCommand {
  constructor(
    public readonly shareId: string,
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
  ) {}
}
