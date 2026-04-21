export interface IEntitlementLookup {
  hasActiveEntitlement(userId: string, containerId: string): Promise<boolean>;
}

export const ENTITLEMENT_LOOKUP = Symbol('IEntitlementLookup');
