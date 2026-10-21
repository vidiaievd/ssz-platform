import type { Result } from '../../../../shared/kernel/result.js';
import type { BillingAccount, BillingAccountType } from '../../domain/billing-account.js';

export interface IBillingAccountRepository {
  /** The account with its open subscriptions, or null when the payer was never seen. */
  find(type: BillingAccountType, externalId: string): Promise<BillingAccount | null>;
  /**
   * Same, creating the account row first when it is missing. An account with no
   * subscription is simply on its audience's free plan, so creating one is harmless even
   * when the change that asked for it is then refused.
   */
  ensure(type: BillingAccountType, externalId: string): Promise<BillingAccount>;
  /**
   * Accounts whose last snapshot's `validUntil` has passed — time alone changed what they
   * may use. Ones with a snapshot still unsent are left out: that snapshot is newer anyway.
   */
  dueForRefresh(now: Date, limit: number): Promise<{ type: BillingAccountType; externalId: string }[]>;
  /**
   * Writes the changed subscriptions if the account's revision is still the loaded one,
   * bumping it — also with nothing changed, which is how a refresh announces itself.
   */
  save(account: BillingAccount): Promise<Result<void, 'version_conflict'>>;
}

export const BILLING_ACCOUNT_REPOSITORY = Symbol('BILLING_ACCOUNT_REPOSITORY');
