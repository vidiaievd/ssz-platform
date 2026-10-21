import type { IEntitlementReader } from '../application/ports/entitlement.reader.js';
import type { FeatureEntitlement } from '../domain/entitlement.js';

/**
 * Until plan 78: every agent on for every payer, no quotas, the calendar month (UTC) as the
 * period. Dev and test only — configuration refuses it under NODE_ENV=production.
 *
 * `monthlyCredits` (AI_STUB_MONTHLY_CREDITS) gives every payer the same allowance per agent,
 * so the quota can be tried on dev before any tariff exists.
 */
export class AllEnabledEntitlementReader implements IEntitlementReader {
  constructor(private readonly monthlyCredits: string | null = null) {}

  async getFeature(): Promise<FeatureEntitlement> {
    const now = new Date();
    return {
      enabled: true,
      monthlyCredits: this.monthlyCredits,
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
