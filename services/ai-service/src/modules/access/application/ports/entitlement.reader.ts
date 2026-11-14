import type { FeatureEntitlement } from '../../domain/entitlement.js';
import type { Payer } from '../../domain/payer.js';

/** The payer's tariff, as plan 78 resolves it — see `ProjectedEntitlementReader`. */
export interface IEntitlementReader {
  /** Null when the payer's tariff does not mention the feature. */
  getFeature(payer: Payer, featureKey: string): Promise<FeatureEntitlement | null>;
  /**
   * Asks subscription-service for the payer's tariff now and stores it, so the next
   * `getFeature` does not wait for `subscription.entitlements.changed` to arrive. For readers
   * that must show a change made a moment ago (the admin panel after a grant). Throws when
   * subscription-service cannot be read.
   */
  refresh(payer: Payer): Promise<void>;
}

export const ENTITLEMENT_READER = Symbol('ENTITLEMENT_READER');
