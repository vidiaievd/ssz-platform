import type { PayerEntitlements } from '../../domain/entitlement.js';
import type { BilledPayer } from './entitlement-projection.js';

/** subscription-service's internal API — for a payer the projection has no fresh row for. */
export interface ISubscriptionClient {
  /** Answers for any payer, seen or not. Throws when the service cannot be read. */
  fetchEntitlements(payer: BilledPayer): Promise<PayerEntitlements>;
}

export const SUBSCRIPTION_CLIENT = Symbol('SUBSCRIPTION_CLIENT');
