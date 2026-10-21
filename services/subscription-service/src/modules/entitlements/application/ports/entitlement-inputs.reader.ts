import type { BillingAccountType } from '../../../accounts/domain/billing-account.js';
import type { EntitlementInputs } from '../../domain/entitlements.js';

export interface IEntitlementInputsReader {
  /**
   * Everything the resolver needs for one payer. A payer never seen before has no
   * subscription, no grants and revision 0 — it is on its free plan, and no row is created.
   */
  load(type: BillingAccountType, externalId: string, now: Date): Promise<EntitlementInputs>;
}

export const ENTITLEMENT_INPUTS_READER = Symbol('ENTITLEMENT_INPUTS_READER');
