import type { PayerEntitlements } from '../../domain/entitlement.js';
import type { BilledPayerType } from '../../domain/payer.js';

export interface BilledPayer {
  type: BilledPayerType;
  id: string;
}

/** The local copy of every payer's entitlements, fed by `subscription.entitlements.changed`. */
export interface IEntitlementProjection {
  get(payer: BilledPayer): Promise<PayerEntitlements | null>;
  /**
   * Stores the snapshot unless the one held already supersedes it (`supersedes` in the
   * domain). True when it was stored.
   */
  save(payer: BilledPayer, snapshot: PayerEntitlements): Promise<boolean>;
}

export const ENTITLEMENT_PROJECTION = Symbol('ENTITLEMENT_PROJECTION');
