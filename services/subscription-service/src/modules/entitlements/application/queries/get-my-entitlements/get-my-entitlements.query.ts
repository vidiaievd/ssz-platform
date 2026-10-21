/** The caller's entitlements: a workspace's when `workspaceId` is given, else their own. */
export class GetMyEntitlementsQuery {
  constructor(
    readonly userId: string,
    readonly workspaceId: string | null,
  ) {}
}
