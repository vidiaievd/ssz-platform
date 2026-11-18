import type { BillingAccountType } from '../../domain/billing-account.js';
import type { AdminStatsRows } from '../admin-stats.js';
import type { AccountHistory, AccountOverview, LookupRows } from '../account-views.js';

export interface IAccountReader {
  overview(type: BillingAccountType, externalId: string, now: Date): Promise<AccountOverview | null>;
  history(type: BillingAccountType, externalId: string, now: Date): Promise<AccountHistory | null>;
  /**
   * Batch read for the admin panel's tables: the accounts among `externalIds` that exist (in no
   * particular order) and the audience's free plan. One round of queries whatever the batch size.
   */
  lookup(type: BillingAccountType, externalIds: string[], now: Date): Promise<LookupRows>;
  /**
   * The dashboard's raw numbers (plan 90, phase 3, step 2): plans, current subscriptions per
   * plan version, accounts per type, and what ends between `now` and `horizon` — each ending
   * list capped at ENDING_SOON_LIMIT + 1 rows, so the caller can tell it was cut.
   */
  statsRows(now: Date, horizon: Date): Promise<AdminStatsRows>;
}

export const ACCOUNT_READER = Symbol('ACCOUNT_READER');
