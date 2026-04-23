export class RevokeEntitlementCommand {
  constructor(
    public readonly entitlementId: string,
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
  ) {}
}
