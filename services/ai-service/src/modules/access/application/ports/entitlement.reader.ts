import type { FeatureEntitlement } from '../../domain/entitlement.js';
import type { Payer } from '../../domain/payer.js';

/**
 * The payer's tariff, as plan 78 resolves it. Until 78 ships, either "everything on, no
 * quotas" (a dev flag, refused in production) or "nothing" — see `access.module.ts`.
 */
export interface IEntitlementReader {
  /** Null when the payer's tariff does not mention the feature. */
  getFeature(payer: Payer, featureKey: string): Promise<FeatureEntitlement | null>;
}

export const ENTITLEMENT_READER = Symbol('ENTITLEMENT_READER');
