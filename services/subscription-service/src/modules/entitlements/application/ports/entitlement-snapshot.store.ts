import type { BillingAccountType } from '../../../accounts/domain/billing-account.js';
import type { Entitlements } from '../../domain/entitlements.js';

export interface IEntitlementSnapshotStore {
  /** Accounts whose revision has moved past the last snapshot sent for them. */
  pending(limit: number): Promise<{ type: BillingAccountType; externalId: string }[]>;
  /**
   * Puts `subscription.entitlements.changed` with this snapshot on the outbox and records
   * its version as sent and its `validUntil` as the account's next refresh — in one
   * transaction, and only if no snapshot of this version or newer went out first.
   * False = it had.
   */
  publish(snapshot: Entitlements): Promise<boolean>;
}

export const ENTITLEMENT_SNAPSHOT_STORE = Symbol('ENTITLEMENT_SNAPSHOT_STORE');
