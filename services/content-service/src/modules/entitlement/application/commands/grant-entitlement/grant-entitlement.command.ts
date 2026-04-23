import type { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';

export class GrantEntitlementCommand {
  constructor(
    public readonly callerUserId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly containerId: string,
    public readonly targetUserId: string,
    public readonly entitlementType: EntitlementType,
    public readonly expiresAt: Date | undefined,
    public readonly sourceReference: string | undefined,
    public readonly metadata: Record<string, unknown> | undefined,
  ) {}
}
