import type { IEntitlementReader } from '../application/ports/entitlement.reader.js';
import type { FeatureEntitlement } from '../domain/entitlement.js';

/**
 * Until plan 78: every agent on for every payer, no quotas, the calendar month (UTC) as the
 * period. Dev and test only — configuration refuses it under NODE_ENV=production.
 */
export class AllEnabledEntitlementReader implements IEntitlementReader {
  async getFeature(): Promise<FeatureEntitlement> {
    const now = new Date();
    return {
      enabled: true,
      monthlyCredits: null,
      limits: {},
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }
}

/** Production until plan 78: no tariff exists, so no payer is entitled to any agent. */
export class NoEntitlementReader implements IEntitlementReader {
  async getFeature(): Promise<null> {
    return null;
  }
}
